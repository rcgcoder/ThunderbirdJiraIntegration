'use strict';
const MailParser = require('mailparser').MailParser;
var Readable = require('stream').Readable

module.exports = (input, options, callback) => {
    if (input === null || input === undefined) {
        throw new TypeError('Input cannot be null or undefined.');
    }

    if (!callback && typeof options === 'function') {
        callback = options;
        options = false;
    }

    let promise;
    if (!callback) {
        promise = new Promise((resolve, reject) => {
            callback = callbackPromise(resolve, reject);
        });
    }

    options = options || {};
    let keepCidLinks = !!options.keepCidLinks;

    let mail = {
        attachments: []
    };

    let parser = new MailParser(options);

    parser.on('error', err => {
        callback(err);
    });

    parser.on('headers', headers => {
        mail.headers = headers;
        mail.headerLines = parser.headerLines;
    });

    let reading = false;
    
    let reader = () => {
        reading = true;

        let data = parser.read();

        if (data === null) {
            reading = false;
            return;
        } else if (data.type === 'text') {
			if ((typeof data.text!=="undefined")&&(data.text.indexOf("This is a multipart message in MIME format.")>=0)){
            	mail.attachments.push({
					contentType: "message/rfc822",
					content: Buffer.from(data.text),
					size:data.length,
					filename:"",
					type:"attachment",
					contentDisposition:"attachment"
				}); 
			} else {
	            Object.keys(data).forEach(key => {
	                if (['text', 'html', 'textAsHtml'].includes(key)) {
	                    mail[key] = data[key];
	                }
	        	});
	        }
        } else if (data.type === 'attachment') {
            mail.attachments.push(data);

            let chunks = [];
            let chunklen = 0;
            data.content.on('readable', () => {
                let chunk;
                while ((chunk = data.content.read()) !== null) {
                    chunks.push(chunk);
                    chunklen += chunk.length;
                }
            });

            data.content.on('end', () => {
                data.content = Buffer.concat(chunks, chunklen);
                data.release();
                reader();
            });
        } else {
            reader();
        }
    };

    parser.on('readable', () => {
        if (!reading) {
            reader();
        }
    });

    parser.on('end', () => {
        ['subject', 'references', 'date', 'to', 'from', 'to', 'cc', 'bcc', 'message-id', 'in-reply-to', 'reply-to'].forEach(key => {
            if (mail.headers && mail.headers.has(key)) {
                mail[key.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = mail.headers.get(key);
            }
        });

        if (keepCidLinks) {
            return callback(null, mail);
        }
        parser.updateImageLinks(
            (attachment, done) => done(false, 'data:' + attachment.contentType + ';base64,' + attachment.content.toString('base64')),
            (err, html) => {
                if (err) {
                    return callback(err);
                }
                mail.html = html;

                callback(null, mail);
            }
        );
    });

    if (typeof input === 'string') {
        parser.end(Buffer.from(input));
    } else if (Buffer.isBuffer(input)) {
        parser.end(input);
    } else {
        input
            .once('error', err => {
                input.destroy();
                parser.destroy();
                callback(err);
            })
            .pipe(parser);
    }

    return promise;
};

function callbackPromise(resolve, reject) {
    return function (...args) {
        let err = args.shift();
        if (err) {
            reject(err);
        } else {
            resolve(...args);
        }
    };
}