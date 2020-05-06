const alloha_password = '3CRH*GjKunrL4#G^v@u2';
const http = require('http');
const CryptoJS = require('crypto-js');

let abc = String.fromCharCode(65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122);
    
let salt = {
    _keyStr: abc + '0123456789+/=',
    e: function(e) {
        let t = '', n, r, i, s, o, u, a, f = 0;

        e = salt._ue(e);
        while (f < e.length) {
            n = e.charCodeAt(f++);
            r = e.charCodeAt(f++);
            i = e.charCodeAt(f++);
            s = n >> 2;
            o = (n & 3) << 4 | r >> 4;
            u = (r & 15) << 2 | i >> 6;
            a = i & 63;
            if (isNaN(r)) {
                u = a = 64;
            } else if (isNaN(i)) {
                a = 64;
            }
            t = t + this._keyStr.charAt(s) + this._keyStr.charAt(o) + this._keyStr.charAt(u) + this._keyStr.charAt(a)
        }
        return t;
    },
    d: function(e) {
        let t = '', n, r, i, s, o, u, a, f = 0;

        e = e.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        while (f < e.length) {
            s = this._keyStr.indexOf(e.charAt(f++));
            o = this._keyStr.indexOf(e.charAt(f++));
            u = this._keyStr.indexOf(e.charAt(f++));
            a = this._keyStr.indexOf(e.charAt(f++));
            n = s << 2 | o >> 4;
            r = (o & 15) << 4 | u >> 2;
            i = (u & 3) << 6 | a;
            t = t + dechar(n);
            if (u != 64) {
                t = t + dechar(r);
            }
            if (a != 64) {
                t = t + dechar(i);
            }
        }
        t = salt._ud(t);
        return t;
    },
    _ue: function(e) {
        e = e.replace(/\r\n/g, "\n");
        let t = '';
        for (let n = 0; n < e.length; n++) {
            let r = e.charCodeAt(n);
            if (r < 128) {
                t += dechar(r);
            } else if (r > 127 && r < 2048) {
                t += dechar(r >> 6 | 192);
                t += dechar(r & 63 | 128);
            } else {
                t += dechar(r >> 12 | 224);
                t += dechar(r >> 6 & 63 | 128);
                t += dechar(r & 63 | 128);
            }
        }
        return t;
    },
    _ud: function(e) {
        let t = "", n = 0, r = 0, c2 = 0;
        while (n < e.length) {
            r = e.charCodeAt(n);
            if (r < 128) {
                t += dechar(r);
                n++;
            } else if (r > 191 && r < 224) {
                c2 = e.charCodeAt(n + 1);
                t += dechar((r & 31) << 6 | c2 & 63);
                n += 2;
            } else {
                c2 = e.charCodeAt(n + 1);
                c3 = e.charCodeAt(n + 2);
                t += dechar((r & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
                n += 3;
            }
        }
        return t;
    }
}

function dechar(x) {
    return String.fromCharCode(x);
}

function pepper(s, n, y) {
    s = s.replace(/\+/g, "#").replace(/#/g, "+");
    let a = sugar(y) * n;

    if (n < 0)
        a += abc.length / 2;

    let r = abc.substr(a * 2) + abc.substr(0, a * 2);
    return s.replace(/[A-Za-z]/g, function(c) {
        return r.charAt(abc.indexOf(c));
    })
}

function sugar(x) {
    x = x.split(dechar(61));
    let result = '', c1 = dechar(120), chr;
    for (let i in x) {
        if (x.hasOwnProperty(i)) {
            let encoded = '';

            for (let j in x[i])
                if (x[i].hasOwnProperty(j))
                    encoded += (x[i][j] == c1) ? dechar(49) : dechar(48);

            chr = parseInt(encoded, 2);
            result += dechar(chr.toString(10));
        }
    }
    return result.substr(0, result.length - 1);
}

function decode(x, y) {
    if (x.substr(0, 2) == "#1")
        return salt.d(pepper(x.substr(2), -1, y));
    
    if (x.substr(0, 2) == "#0")
        return salt.d(x.substr(2));
        
    return x;
}

function exist(x) {
    return x != null && typeof(x) != 'undefined' && x != 'undefined';
}

function b1(str) {
    return Buffer.from(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode("0x" + p1);
    }), 'binary').toString('base64');
}

function b2(str) {
    return decodeURIComponent(Buffer.from(str, 'base64').toString('binary').split("").map(function(c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
}

function fd2(x, v) {
    let a = x.substr(2);

    for(let i = 4;i > -1; i--)
        if(exist(v['bk' + i]) && v['bk' + i] != '')
            a = a.replace((v.file3_separator || '//') + b1(v['bk' + i]), '');

    try {
        a = b2(a);
    } catch(e) {
        console.log(e);
        a = '';
    }

    return a;
}

let CryptoJSAesJson = {
    stringify: function(cipherParams) {
        let j = {
            ct: cipherParams.ciphertext.toString(CryptoJS.enc.Base64)
        };
        if (cipherParams.iv) j.iv = cipherParams.iv.toString();
        if (cipherParams.salt) j.s = cipherParams.salt.toString();
        return JSON.stringify(j);
    },
    parse: function(jsonStr) {
        let j = JSON.parse(jsonStr);
        let cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Base64.parse(j.ct)
        });
        if (j.iv) cipherParams.iv = CryptoJS.enc.Hex.parse(j.iv);
        if (j.s) cipherParams.salt = CryptoJS.enc.Hex.parse(j.s);
        return cipherParams;
    }
};

function fd3(x, v) {
    let a, y = x.split(v.file3_separator);
    if(y.length == 3) {
        try {
            a = JSON.parse(CryptoJS.AES.decrypt('{"ct":"' + y[0].substr(2) + '","iv":"' + y[1] + '","s":"' + y[2] + '"}', alloha_password, {
                format:CryptoJSAesJson
            }).toString(CryptoJS.enc.Utf8));
        }
        catch(e) {}
    }
    return a;
}

function getJsContent(url) {
    return new Promise((resolve, reject) => {
        let request1 = http.request(url || 'http://cdn.thealloha.club/js/playerjs-alloha-new.js?v=10.08.73', (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => resolve(data));
        });
        request1.on('error', (e) => console.log(e.message));
        request1.end();
    });
}

function fuckAlloha(url) {
    return new Promise(async (resolve, rejecte) => {
        let content = await getJsContent();
        content = content.match(/eval(.+)/gm)[0];

        var env = {
            eval: function (c) {
                content = c;
            },
            window: {},
            document: {}
        };

        eval("with(env) {" + content + "}");

        let y = content.match(/y:'(.+)',isflash/gm)[0].replace('y:\'', '').replace(',isflash', ''),
            u = content.match(/u:'(.+)',u2/gm)[0].replace('u:\'', '').replace('\',u2', '');

        let v = JSON.parse(decode(u, y));

        makePostRequest(url, '', (response, body) => {
            let bs = JSON.parse(fd2(body.match(/new Playerjs\("(.+)"\)/)[1], v));
            resolve(fd3(bs.file, v));
        }, {
            'Host': 'allobaro.allohastream.com',
            'Referer': 'https://allobaro.allohastream.com/',
            'Connection': 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'ru,ja;q=0.9,ru-RU;q=0.8,en-US;q=0.7,en;q=0.6,uk;q=0.5,und;q=0.4',
        });
    });
}