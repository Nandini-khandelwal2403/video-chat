'use strict';

var isChannelReady = false;
var isInitiator = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var isStarted = false;
var userStream;
var userAudio;

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
    audio: true,
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
var room = prompt('Enter room name: ');

var socket = io.connect();

if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or join room', room);
}

socket.on('created', function (room) {
    console.log('Created Room ' + room);
    isInitiator = true;
});

socket.on('full', function (room) {
    console.log('Room ' + room + ' is full');
});

socket.on('join', function (room) {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function (room) {
    console.log('joined: ' + room);
    isChannelReady = true;
});

socket.on('log', function (array) {
    console.log.apply(console, array);
});

socket.on('message', function (message, room) {
    console.log('Client recieved message: ', message, room);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isInitiator && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

function sendMessage(message, room) {
    console.log('Client sending message: ', message, room);
    socket.emit('message', message, room);
}

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
console.log("Going to find Local media");
navigator.mediaDevices.getUserMedia(localStreamConstraints)
    .then(gotStream)
    .catch(function (e) {
        alert('getUserMedia() error: ' + e.name);
    });

function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage('got user media', room);
    if (isInitiator) {
        maybeStart();
    }
}

// console.log('Getting user media with constraints', localStreamConstraints);

function maybeStart() {
    console.log('>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>> creating peer connection');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            doCall();
        }
    }
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(pcConfig);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
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

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndMessage sending message', sessionDescription);
    sendMessage(sessionDescription, room);
}

function onCreateSessionDescriptionError(error) {
    TrackEvent('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
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

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        }, room);
    } else {
        console.log('End of candidates.');
    }
}