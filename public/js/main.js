'use strict';

var isChannelReady = false;
var isInitiator = false;
var localStream;
var pc = {};
var remoteStream;
var turnReady;
var isStarted = false;
var userStream;
var userAudio;

let localID;

var pcConfig = turnConfig;

const toggleButton1 = document.querySelector('.cam');
const toggleButton2 = document.querySelector('.aud');

// navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
//     userStream = stream;
// })

// const audio1 = navigator.mediaDevices.getUserMedia({ audio: true });
// userAudio = audio1;

// var localStreamConstraints = {
//     audio2: userAudio,
//     stream2: userStream,
// }

var localStreamConstraints = {
    audio: false,
    video: true,
}



toggleButton1.addEventListener('click', () => {
    const videoTrack = localStream.getTracks().find(track => track.kind === 'video');
    if (videoTrack.enabled) {
        videoTrack.enabled = false;
        toggleButton1.innerHTML = 'Show cam';
    } else {
        videoTrack.enabled = true;
        toggleButton1.innerHTML = 'Hide cam';
    }
})

toggleButton2.addEventListener('click', () => {
    const audioTrack = localStream.getTracks().find(track => track.kind === 'audio');
    if (audioTrack.enabled) {
        audioTrack.enabled = false;
        toggleButton2.innerHTML = "Audio on";
    } else {
        audioTrack.enabled = true;
        toggleButton2.innerHTML = "Audio off";
    }
})
var room = 123 || prompt('Enter room name: ');

var socket = io.connect();

// if (room !== '') {
//     socket.emit('create or join', room);
//     console.log('Attempted to create or join room', room);
// }

socket.on('created', function(room, ID) {
    console.log('Created Room ' + room);
    localID = ID; // client who created the room
    console.log(`Local ID: ${localID}`);
    isInitiator = false;
});

socket.on('full', function(room) {
    console.log('Room ' + room + ' is full');
});

socket.on('join', function(room, ID) {
    console.log('Another peer ' + ID + ' made a request to join room ' + room);
    // console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
    maybeStart(ID, false);
    socket.emit('p2p', 'start', room, localID, ID);
});

socket.on('joined', function(room, ID) {
    console.log(ID + ' joined ' + room);
    localID = ID; // all the clients who joined the room
    console.log(`Local ID: ${localID}`);
    isInitiator = true;
    isChannelReady = true;

});

socket.on('start', function(room, ID) {
    maybeStart(ID, true);
})

socket.on('log', function(array) {
    console.log.apply(console, array);
});

socket.on('message', function(message, room, ID) {
    // console.log('Client recieved message: ', message, room, ID);
    if (message === 'got user media') {
        // maybeStart(ID);
    } else if (message.type === 'offer') {
        console.log(`Offer from ${ID}`);
        // if (!isInitiator && !isStarted) {
        //     maybeStart(ID);
        // }
        pc[ID].pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer(ID);
    } else if (message.type === 'answer' && isStarted) {
        console.log(`Answer from ${ID}`);
        pc[ID].pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        console.log(`Candidate from ${ID}`);
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc[ID].pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

function sendMessage(message, room, local, ID) {
    // console.log('Client sending message: ', message, room);
    socket.emit('message', message, room, local, ID);
}

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
console.log("Going to find Local media");
navigator.mediaDevices.getUserMedia(localStreamConstraints)
    .then(gotStream)
    .catch(function(e) {
        alert('getUserMedia() error: ' + e.name);
    });

function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    if (room !== '') {
        socket.emit('create or join', room);
        console.log('Attempted to create or join room', room);
    }
    // sendMessage('got user media', room, localID);
    // if (isInitiator) {
    //     maybeStart();
    // }
}

// console.log('Getting user media with constraints', localStreamConstraints);

function maybeStart(ID, initCall) {
    console.log('>>>>> maybeStart() ', isStarted, localStream, initCall);
    if (isChannelReady) {
        console.log('>>>>> creating peer connection with ' + ID);
        createPeerConnection(ID);
        pc[ID].pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (initCall) {
            doCall(ID);
        }
    }
}

function createPeerConnection(ID) {
    try {
        pc[ID] = { pc: new RTCPeerConnection(pcConfig), id: ID };
        pc[ID].pc.onicecandidate = event => handleIceCandidate(event, ID);
        pc[ID].pc.onaddstream = event => handleRemoteStreamAdded(event, ID);
        pc[ID].pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall(ID) {
    console.log('Sending offer to peer ' + ID);
    pc[ID].pc.createOffer(sdp => setLocalAndSendMessage(sdp, ID), handleCreateOfferError);
}

function doAnswer(ID) {
    console.log('Sending answer to peer ' + ID);
    pc[ID].pc.createAnswer().then(ans =>
        setLocalAndSendMessage(ans, ID),
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription, ID) {
    pc[ID].pc.setLocalDescription(sessionDescription);
    // console.log('setLocalAndMessage sending message');
    sendMessage(sessionDescription, room, localID, ID);
}

function onCreateSessionDescriptionError(error) {
    TrackEvent('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event, ID) {
    console.log('Remote stream added.');
    // remoteStream = event.stream;
    let remoteVideo = document.createElement('video');
    remoteVideo.srcObject = event.stream;
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.id = ID;
    let remoteDiv = document.querySelector('.remote_div');
    remoteDiv.appendChild(remoteVideo);
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye', room);
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
}

function handleIceCandidate(event, ID) {
    // console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        }, room, localID, ID);
    } else {
        console.log('End of candidates.');
    }
}