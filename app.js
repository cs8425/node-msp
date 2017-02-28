'use strict';

const net = require('net')

const MSP = require('./node-msp.js')
var msp = new MSP();

//console.log('Codes', Object.keys(msp.Codes))

msp.on('frame', function(err, frame){
	if(err) return
//	console.log((new Date()).getTime(), 'frame', JSON.stringify(frame))

//	var obj = msp.parseFrame(frame)
//	console.log((new Date()).getTime(), 'data', obj)
})
msp.on('data', function(obj){
	console.log((new Date()).getTime(), 'data', obj.code, obj)
})

msp.on('extcmd', function(frame){
	console.log((new Date()).getTime(), 'extcmd', frame.code, frame)
})


var client = net.connect(2323, '192.168.1.115', function(){
	console.log('connected to server!', msp)

	msp.setSender(function(data){
		//console.log('_write', data)
		client.write(data)
	})

	msp.pull_FC_info()

	ping()
})
client.on('data', function(data){
	//console.log(data)
	msp.readbytes(data)
})
client.on('end', function(){
	console.log('disconnected from server')
})

function ping(){
	var buf = msp.create_message(msp.Codes.MSP_STATUS_EX, null)
	client.write(buf)
	var t = setTimeout(ping, 1500)
}

