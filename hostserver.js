const http = require('http');

const fs = require('fs');
const ThumbnailGenerator = require('video-thumbnail-generator');
const FileType = require('file-type');
const readChunk = require('read-chunk');
const pump = require('pump');
const rangeParser = require('range-parser');

const scanfolder = 'D:/torrents/';

class server {

    constructor(port) {
        this.videos = [];
        this.subtitles = [];

        this.port = port;
        this.setupSomeRoutes();
        this.scanForVideos(scanfolder);
        this.scanForSubtitles(scanfolder);

        setInterval(() => {
            
            this.videos = [];
            this.subtitles = [];

            this.scanForVideos(scanfolder);
            this.scanForSubtitles(scanfolder);
        }, 25000);
    }

    createThumbnail(path) {
        let pth = path.split('.');

        pth = path.replace('.' + pth[pth.length - 1], '').split('/');

        if(fs.existsSync(`${scanfolder}/tmp/${pth[pth.length - 1]}-thumbnail-320x240-0001.png`))
            return;
        
        let tg = new ThumbnailGenerator({
            sourcePath: `${path}`,
            thumbnailPath: `${scanfolder}/tmp/`,
            tmpDir: `${scanfolder}/tmp/`
        });

        tg.generateOneByPercent(50).then((img) => console.log('Created thumbnail for ' + path));
    }

    scanForSubtitles(path) {
        fs.readdir(path, (err, files) => {
            if(err)
                throw err;

            files.forEach(file => {
                if(fs.lstatSync(path + file).isDirectory()) {
                    this.scanForSubtitles(path + file + '/');
                    return;
                }

                if(!this.isSupportedSubtitles(file))
                    return;

                let splitted = path.split('/');

                this.subtitles.push({ anime: this.replaceTrash(splitted[splitted.length - 3]), type: this.getFileExtenstion(file), name: this.replaceTrash((path + file).replace(scanfolder, '')) });
            });
        });
    }

    scanForVideos(path) {
        fs.readdir(path, (err, files) => {
            if(err)
                throw err;

            files.forEach(async file => {
                if(fs.lstatSync(path + file).isDirectory()) {
                    this.scanForVideos(path + file + '/');
                    return;
                }

                if(!this.isVideo(file))
                    return;

                const buffer = readChunk.sync(path + file, 0, FileType.minimumBytes);
                let b = await FileType.fromBuffer(buffer);

                /* if(b.mime === 'video/x-matroska')
                    return; */

                this.createThumbnail(path + file);
                this.videos.push(this.replaceTrash((path + file).replace(scanfolder, '')));
            });
        });
    }

    getFileExtenstion(path) {
        let ext = path.split('.');
        return ext[ext.length - 1];
    }

    replaceTrash(str) {
        //return str.replace(' [1080p]', '').replace('[HorribleSubs] ', '');
        return str;
    }

    isSupportedSubtitles(path) {
        let ext = this.getFileExtenstion(path);
        return ext === 'srt' || ext === 'ass';
    }

    isVideo(path) {
        let ext = this.getFileExtenstion(path);
        return ext === 'mp4' || ext === 'mkv' || ext === 'avi' || ext === 'wmv' || ext === 'flv';
    }

    setupSomeRoutes() {
        let server = http.createServer((req, res) => {
            if (req.headers.origin)
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin);

            // /getvideolist/16 -> getvideo/16 -> [0] => getvideo, [1] => '16'...
            let args = req.url.slice(1).split('/');

            let baseurl = args[0];

            if(!baseurl) {
                res.statusCode = 404;
                res.end();
                return;
            }

            if(baseurl === 'getvideo') {
                this.getVideo(req, res, args);
                return;
            }

            if(baseurl === 'getvideolist') {
                this.getVideoList(req, res, args);
                return;
            }

            if(baseurl === 'getsubtitleslist') {
                this.getSubtitlesList(req, res, args);
                return;
            }

            if(baseurl === 'getthumbnail') {
                this.getThumbnail(req, res, args);
                return;
            }

            if(baseurl === 'getsubtitle') {
                this.getSubtitle(req, res, args);
                return;
            }
            res.statusCode = 404;
            res.end();
        });

        server.listen(this.port);
    }

    sendError(res, message) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');

        res.write(JSON.stringify({ error: message }));
        res.end();
    }

    /* 
        Получение субтитров в json формате
    */
    getSubtitle(req, res, args) {
        let subtitleid = parseInt(args[1]);
        if(subtitleid === '' || subtitleid === undefined || subtitleid === null || !Number.isInteger(subtitleid)) {
            this.sendError(res, 'subtitleid argument missing or invalid');
            return;
        }

        let subtitle = this.subtitles[subtitleid],
            path     = `${scanfolder}/${subtitle.name}`;

        if(!subtitle || !fs.existsSync(path)) {
            this.sendError(res, 'subtitle file not found');
            return;
        }

        let stat     = fs.statSync(path),
            fileSize = stat.size;

        res.statusCode = 200;

        res.setHeader('Content-Length', fileSize);
        res.setHeader('Content-Type', 'text/plain');

        pump(fs.createReadStream(path), res);

        return;
    }

    /* 
        Получение превью
    */
    getThumbnail(req, res, args) {
        let thumbnailid = parseInt(args[1]);
        if(thumbnailid === '' || thumbnailid === undefined || thumbnailid === null || !Number.isInteger(thumbnailid)) {
            this.sendError(res, 'thumbnailid argument missing or invalid');
            return;
        }

        let photo = this.videos[thumbnailid];

        if(!photo) {
            this.sendError(res, 'Thumbnail file was not found');
            return;
        }

        let pth = photo.split('.');

        pth = photo.replace('.' + pth[pth.length - 1], '').split('/');

        pth = `${scanfolder}/tmp/${pth[pth.length - 1]}-thumbnail-320x240-0001.png`;

        if(!fs.existsSync(pth)) {
            this.sendError(res, 'Thumbnail file was not found');
            return;
        }

        let stat     = fs.statSync(pth),
            fileSize = stat.size;

        res.statusCode = 200;

        res.setHeader('Content-Length', fileSize);
        res.setHeader('Content-Type', 'image/png');

        pump(fs.createReadStream(pth), res);

        return;
    }

    getSubtitlesList(req, res, args) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');

        res.write(JSON.stringify({ subtitles: this.subtitles }));
        res.end();
    }

    getVideoList(req, res, args) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');

        res.write(JSON.stringify({ videos: this.videos }));
        res.end();
    }

    getVideo(req, res, args) {
        let videoID = parseInt(args[1]);

        if(videoID === '' || videoID === undefined || videoID === null || !Number.isInteger(videoID)) {
            this.sendError(res, 'videoID argument missing');
            return;
        }

        let video = this.videos[videoID];

        if(!video) {
            this.sendError(res, 'Video file was not found');
            return;
        }

        let path = `${scanfolder}/${video}`;

        if(!fs.existsSync(path)) {
            this.sendError(res, 'Video file was not found');
            return;
        }

        let stat     = fs.statSync(path),
            fileSize = stat.size,
            range = req.headers.range && rangeParser(fileSize, req.headers.range)[0];


        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');

        if (!range) {
            res.setHeader('Content-Length', fileSize);

            if (req.method === 'HEAD')
                return res.end();

            pump(fs.createReadStream(path), res);
            return;
        }

        res.statusCode = 206;
        res.setHeader('Content-Length', range.end - range.start + 1);
        res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + fileSize);

        if (req.method === 'HEAD')
            return res.end();

        pump(fs.createReadStream(path, range), res);
    }

}

const serverb = new server(3000);