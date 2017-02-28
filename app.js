'use strict';

const net = require('net')

const MSP = require('./node-msp.js')
var msp = new MSP();

msp.on('frame', function(err, frame){
	console.log((new Date()).getTime(), 'frame', JSON.stringify(frame))
	var obj = msp.parseFrame(frame)
	console.log((new Date()).getTime(), 'data', obj)
})


var client = net.connect(2323, '192.168.1.115', function(){
	console.log('connected to server!', msp)
	/*msp.setSender(function(data){
		console.log('_write', data, this)
		client.write(data)
	})*/


	for(var i=1; i<6 ;i++){
		msp.create_message(i, null, function(data){
			console.log('send', data)
			client.write(data)
		})
	}

	var t = setTimeout(ping, 500)
})
client.on('data', function(data){
	//console.log(data)
	msp.readbytes(data)
})
client.on('end', function(){
	console.log('disconnected from server')
})

function ping(){
	msp.create_message(msp.Codes.MSP_STATUS_EX, null, function(data){
		client.write(data)
		var t = setTimeout(ping, 1500)
	})
}

