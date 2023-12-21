// JSON Buffer Stream
// Handles buffering JSON records over standard streams (pipes or sockets)
//
// Assumes one entire JSON document per line, delimited by EOL.
// Emits 'json' event for each JSON document received.
// Emits `text` event for each non-JSON line.
// write() method accepts object to be JSON-stringified and written to stream.
// Passes errors thru on 'error' event (with addition of JSON parse errors).
//
// Copyright (c) 2014 - 2022 Joseph Huckaby
// Released under the MIT License

// import os from 'os';
import EventEmitter from 'node:events';

export default class JsonStream extends EventEmitter {
    
    streamIn
    streamOut
    buffer: string
    perf: any
    recordRegExp = /^\s*\{/
    preserveWhitespace = false
    maxLineLength = 1024 * 1024
    EOL = '\n'
    
    constructor(stream_in, stream_out) {
        super()
        // class constructor
        if (!stream_out) stream_out = stream_in;
        
        this.streamIn = stream_in;
        this.streamOut = stream_out;
        
        this.init();
    }
    
    setPerf(perf) { this.perf = perf; }
    
    init() {
        // hook stream read
        var self = this;
        
        this.streamIn.setEncoding('utf8');
        this.streamIn.on('data', function(data) {
            if (self.buffer) {
                data = self.buffer + data;
                if (data.length > self.maxLineLength) data = data.substring( data.length - self.maxLineLength );
                self.buffer = '';
            }
            
            var records = data.split( self.EOL );
            
            // see if data ends on EOL -- if not, we have a partial block
            // fill buffer for next read
            if (data.substring(data.length - self.EOL.length) != self.EOL) {
                self.buffer = records.pop();
            }
            
            var record = '';
            var json = null;
            
            for (var idx = 0, len = records.length; idx < len; idx++) {
                record = records[idx];
                if (record.match(self.recordRegExp)) {
                    json = null;
                    
                    if (self.perf) self.perf.begin('json_stream_parse');
                    try { json = JSON.parse(record); }
                    catch (e) {
                        self.emit('error', new Error("JSON Parse Error: " + e.message), record);
                    }
                    if (self.perf) {
                        self.perf.end('json_stream_parse');
                        self.perf.count('json_stream_msgs_read', 1);
                        self.perf.count('json_stream_bytes_read', record.length + self.EOL.length);
                    }
                    
                    if (json) {
                        self.emit('json', json);
                    }
                } // record has json
                else if (self.preserveWhitespace || record.match(/\S/)) {
                    // non-json garbage, emit text event just in case app cares
                    // but only if (1) text has non-whitespace, or (2) preserveWhitespace is set
                    var text = record + ((idx < len - 1) ? self.EOL : '');
                    if (text.length) self.emit('text', text);
                }
            } // foreach record
            
        } );
        
        // catch errors on both streams
        if (this.streamOut != this.streamIn) {
            // separate streams
            this.streamIn.on('error', function(err) {
                self.emit('error', "Error in input stream: " + err.message);
            } );
            this.streamOut.on('error', function(err) {
                self.emit('error', "Error in output stream: " + err.message);
            } );
        }
        else {
            // bi-directional stream
            this.streamIn.on('error', function(err) {
                self.emit('error', err);
            } );
        }
        
        // catch end of stream
        this.streamIn.on('end', function() {
            self.emit('end');
        } );
    }
    
    write(json, callback?) {
        // write json data to stream plus EOL
        if (this.perf) this.perf.begin('json_stream_compose');
        var data = JSON.stringify(json);
        if (this.perf) {
            this.perf.end('json_stream_compose');
            this.perf.count('json_stream_msgs_written', 1);
            this.perf.count('json_stream_bytes_written', data.length + this.EOL.length);
        }
        
        var result = this.streamOut.write( data + this.EOL, callback );
        if (!result && this.perf) {
            this.perf.count('json_stream_write_buffer', 1);
        }
        return result;
    }
    
}
