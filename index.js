'use strict';

var os = require('os');
var express = require('express');
var app = express();
var http = require('http');
var https = require('https');
var socketIO = require('socket.io');

var fs = require('fs');
var path = require('path'); // why required ? its use ?
const key = fs.readFileSync(path.join(__dirname, '/certs/selfsigned.key'));
const cert = fs.readFileSync(path.join(__dirname, '/certs/selfsigned.crt'));
const options = {
    key: key,
    cert: cert
};

app.use(express.static('public'));

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/public/views/index.html");
});

// var server = http.createServer(app);
const server = http.createServer(options, app); // why have we given this app and options
server.listen(process.env.PORT || 8000);

var io = socketIO(server);

io.sockets.on('connection', function (socket) {
    function log() {
        var array = ['Message from server: '];
        array.push.apply(array, arguments);
        // socket.emit('log', array);
        console.log(array);
    }

    socket.on('message', function (message, room, sender, receiver) {
        log('client said: ', message, sender);
        io.to(receiver).emit('message', message, room, sender);
    });

    socket.on('p2p', function (message, room, sender, receiver) {
        io.to(receiver).emit(message, room, sender);
    })

    socket.on('create or join', function (room) {
        log("Recieved request to create or join room " + room + " from " + socket.id);

        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom).length : 0;
        log('Room' + room + " now has " + numClients + ' client(s)');

        if (numClients === 0) {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            socket.emit('created', room, socket.id);

        } else if (numClients >= 1) {
            log('Client ID ' + socket.id + ' joined room ' + room);

            //ismai baaki 2 extra lines ka kya need tha 
            io.sockets.in(room).emit('join', room, socket.id);
            socket.join(room);
            socket.emit('joined', room, socket.id, numClients);
            io.sockets.in(room).emit('ready');
            //-----------
        } else {
            socket.emit('full', room);
        }
    });

    //ye kiska ip address chahiye inhe aur kar kaise rahe hai?
    socket.on('ipaddr', function () {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function (details) {
                if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
                    socket.emit('ipaddr', details.address);
                }
            });
        }
    });

    socket.on('bye', function () {
        console.log('recieved bye');
    });

});