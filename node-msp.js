'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var MSPCodes = require('./MSPCodes');

var MSP = function () {
	var self = this
	self.state = 0
	self.message_direction = 1
	self.message_length_expected = 0
	self.message_length_received = 0

	self.message_checksum = 0
	self.messageIsJumboFrame = false
	self.crcError = false

	self.message_buffer = null
	self.message_buffer_uint8_view = null

	self.packet_error = 0
	self.unsupported = 0

	self.last_received_timestamp = null
	self.JUMBO_FRAME_SIZE_LIMIT = 255

	self.timeout = 1000


//	self.sender = null
//	self.on('data', read)
};

util.inherits(MSP, EventEmitter);
module.exports = MSP;

MSP.prototype.Codes = MSPCodes


MSP.prototype.readbytes = function (data){
	var self = this
	for (var i = 0; i < data.length; i++) {
		switch (self.state) {
			case 0: // sync char 1
				if (data[i] == 36) { // $
					self.state++;
				}
				break;
			case 1: // sync char 2
				if (data[i] == 77) { // M
					self.state++;
				} else { // restart and try again
					self.state = 0;
				}
				break;
			case 2: // direction (should be >)
				self.unsupported = 0;
				if (data[i] == 62) { // >
					self.message_direction = 1;
				} else if (data[i] == 60) { // <
					self.message_direction = 0;
				} else if (data[i] == 33) { // !
					// FC reports unsupported message error
					self.unsupported = 1;
				}

				self.state++;
				break;
			case 3:
				self.message_length_expected = data[i];
				if (self.message_length_expected === self.JUMBO_FRAME_SIZE_LIMIT) {
					self.messageIsJumboFrame = true;
				}

				self.message_checksum = data[i];

				self.state++;
				break;
			case 4:
				self.code = data[i];
				self.message_checksum ^= data[i];

				if (self.message_length_expected > 0) {
					// process payload
					if (self.messageIsJumboFrame) {
						self.state++;
					} else {
						self.state = self.state + 3;
					}
				} else {
					// no payload
					self.state += 5;
				}
				break;
			case 5:
				self.message_length_expected = data[i];

				self.message_checksum ^= data[i];

				self.state++;

				break;
			case 6:
				self.message_length_expected = self.message_length_expected  + 256 * data[i];

				self.message_checksum ^= data[i];

				self.state++;

				break;
			case 7:
				// setup arraybuffer
				self.message_buffer = new ArrayBuffer(self.message_length_expected);
				self.message_buffer_uint8_view = new Uint8Array(self.message_buffer);

				self.state++;
			case 8: // payload
				self.message_buffer_uint8_view[self.message_length_received] = data[i];
				self.message_checksum ^= data[i];
				self.message_length_received++;

				if (self.message_length_received >= self.message_length_expected) {
					self.state++;
				}
				break;
			case 9:
				var buf = null
				if (self.message_checksum == data[i]) {
					// message received, store buffer
					buf = Buffer.from(self.message_buffer, 0, self.message_length_expected)
				} else {
					console.log('code: ' + self.code + ' - crc failed');
					self.packet_error++;
					self.crcError = true;
				}
				// Reset variables
				self.message_length_received = 0;
				self.state = 0;
				self.messageIsJumboFrame = false;
				//self.notify();
				self.emit('frame', self.crcError, {
					crcError: self.crcError,
					code: self.code,
					data: buf
				})
				self.crcError = false;
				break;

			default:
				console.log('Unknown state detected: ' + self.state);
		}
	}
}

MSP.prototype.create_message = function (code, data, callback_sent) {
	var self = this
	var bufferOut, bufView;

	// always reserve 6 bytes for protocol overhead !
	if (data) {
		var size = data.length + 6,
		checksum = 0;

		bufferOut = new ArrayBuffer(size);
		bufView = new Uint8Array(bufferOut);

		bufView[0] = 36; // $
		bufView[1] = 77; // M
		bufView[2] = 60; // <
		bufView[3] = data.length;
		bufView[4] = code;

		checksum = bufView[3] ^ bufView[4];

		for (var i = 0; i < data.length; i++) {
		bufView[i + 5] = data[i];

		checksum ^= bufView[i + 5];
		}

		bufView[5 + data.length] = checksum;
	} else {
		bufferOut = new ArrayBuffer(6);
		bufView = new Uint8Array(bufferOut);

		bufView[0] = 36; // $
		bufView[1] = 77; // M
		bufView[2] = 60; // <
		bufView[3] = 0; // data length
		bufView[4] = code; // code
		bufView[5] = bufView[3] ^ bufView[4]; // checksum
	}

	callback_sent(Buffer.from(bufferOut))

/*	var obj = {'code': code, 'requestBuffer': bufferOut, 'callback': (callback_msp) ? callback_msp : false, 'timer': false, 'callbackOnError': callbackOnError};

	var requestExists = false;
	for (var i = 0; i < MSP.callbacks.length; i++) {
		if (MSP.callbacks[i].code == code) {
			// request already exist, we will just attach
			requestExists = true;
			break;
		}
	}

	if (!requestExists) {
		obj.timer = setInterval(function () {
			console.log('MSP data request timed-out: ' + code);

			self.sender(bufferOut, false);
		}, self.timeout); // we should be able to define timeout in the future
	}

	MSP.callbacks.push(obj);

	// always send messages with data payload (even when there is a message already in the queue)
	if (data || !requestExists) {
		self.sender(bufferOut, function (sendInfo) {
			if (sendInfo.bytesSent == bufferOut.byteLength) {
				if (callback_sent) callback_sent();
			}
		});
	}*/

	return true;
}

MSP.prototype.parseFrame = function (frame){
	var code = frame.code
	var data = frame.data
    var crcError = frame.crcError
	var offset = 0
	var obj = {}

	if(crcError){
		return obj
	}

	obj.code = code
	switch (code) {
		case MSPCodes.MSP_STATUS:
			obj.cycleTime = data.readU16();
			obj.i2cError = data.readU16();
			obj.activeSensors = data.readU16();
			obj.mode = data.readU32();
			obj.profile = data.readU8();
			break
		case MSPCodes.MSP_STATUS_EX:
			obj.cycleTime = data.readU16();
			obj.i2cError = data.readU16();
			obj.activeSensors = data.readU16();
			obj.mode = data.readU32();
			obj.profile = data.readU8();
			obj.cpuload = data.readU16();
			obj.numProfiles = data.readU8();
			obj.rateProfile = data.readU8();
			break

		default:
			console.log('code not found', code, data)
	}

	return obj
}

Buffer.prototype.__mspoffset = 0
Buffer.prototype.readU32 = function (){
	var u32 = this.readUInt32LE(this.__mspoffset)
	this.__mspoffset += 4
	return u32
}
Buffer.prototype.read32 = function (){
	var i32 = this.readInt32LE(this.__mspoffset)
	this.__mspoffset += 4
	return i32
}
Buffer.prototype.readU16 = function (){
	var u16 = this.readUInt16LE(this.__mspoffset)
	this.__mspoffset += 2
	return u16
}
Buffer.prototype.read16 = function (){
	var i16 = this.readInt16LE(this.__mspoffset)
	this.__mspoffset += 2
	return i16
}
Buffer.prototype.readU8 = function (){
	var u8 = this.readUInt8(this.__mspoffset)
	this.__mspoffset += 1
	return u8
}
Buffer.prototype.read8 = function (){
	var i8 = this.readInt8(this.__mspoffset)
	this.__mspoffset += 1
	return i8
}

