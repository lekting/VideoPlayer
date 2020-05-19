const fs                = require('fs');
const readLine          = require('readline');

const KuromojiAnalyzer  = require('kuroshiro-analyzer-kuromoji');
const kuroshiro         = new (require('kuroshiro'))();
const storage           = require('electron-json-storage')
const cheerio           = require('cheerio');
const cloudscraper      = require('cloudscraper');

let settings = {
    offset: 0,
    own_url: '',
    volume: 1,
    anime_lists: [],
    saved_anime: []
}

let lines               = [],
    currentIndex        = 0,
    subtitlesLoaded     = false,
    subtitlesLoading    = false,
    kuroshiroInited     = false,
    isSearching         = false,
    videoList           = [],
    subtitlesList       = [],
    currentSubtitle     = null,
    player,
    hiddenNotifTimeoutID,
    octopusInstance;

function saveSettings() {
    storage.set('settings', settings);
}

function loadSettings() {
    storage.has('settings', (error, hasKey) => {
        if(error) throw error;
        
        if(!hasKey)
            return;

        storage.get('settings', (error, data) => {
            if (error) throw error;                    
            settings = data;
            $('.set_own_url .inputes').val(data.own_url);
        });
    });
}

/* Читаем субтитры с сервера */
function readUrlSubtitles(subtitleID) {
    if(subtitlesLoading)
        return;

    if(subtitleID > subtitlesList.length || subtitleID < 0) {
        showMessage('Subtitle not found');
        return;
    }

    let subtitle = subtitlesList[subtitleID];

    /* Если файл ass то запускаем библиотеку для этого */
    if(subtitle.type === 'ass') {
        if(!octopusInstance) {
            octopusInstance = new SubtitlesOctopus({
                video: document.querySelector('video'),
                subUrl: 'http://127.0.0.1:3000/getsubtitle/' + subtitleID,
                workerUrl: './js/subtitles-octopus-worker.js'
            });

            return;
        }
        
        octopusInstance.setTrackByUrl('http://127.0.0.1:3000/getsubtitle/' + subtitleID);

        return;
    }
    
    if(octopusInstance) {
        octopusInstance.dispose();
        octopusInstance = null;
    }

    subtitlesLoaded = false;
    subtitlesLoading = true;

    lines = [];
    currentIndex = 0;

    /* Отсылаем запрос на сервер для получения субтитров */
    $.ajax('http://127.0.0.1:3000/getsubtitle/' + subtitleID)
    .done(async (data) => {
        let ln = data.split(/\r?\n/);

        if(!kuroshiroInited) {
            await kuroshiro.init(new KuromojiAnalyzer());
            kuroshiroInited = true;
        }

        await ln.forEach(async (line) => await pushLine(line));

        subtitlesLoading = false;
        subtitlesLoaded = true;
        $('#subtitlesblock').show();

        showMessage('字幕をアップロードしました');

        clearNullSubtitles();
    }).fail((err) => {
        console.log(err.responseJSON);
        subtitlesLoading = false;
        subtitlesLoaded = false;
    });
}

/* Добавляем в массив новую линию из субтитров TODO: */
async function pushLine(line) {     
    /* Инициализируем хирагану */
    if (!isNaN(line)) {
        lines.push({ id: 0, s_time: 0, e_time: 0, lines: [], h_lines: [], visible: false });
        return;
    }

    if(line.includes('-->')) {
        if(lines[currentIndex].lines.length !== 0)
            currentIndex++;

        let time = line.match(/(.+) --> (.+)/);

        if(!time)
            time = line.match(/(.+) --> (.+) /);

        lines[currentIndex].s_time = strToSecs(time[1]);
        lines[currentIndex].e_time = strToSecs(time[2]);

        return;
    }

    lines[currentIndex].lines.push(line);
    lines[currentIndex].h_lines.push(await kuroshiro.convert(line, { to: 'hiragana' }));
}

/* Удаляем сдломанные субтитры */
function clearNullSubtitles() {
    let newlines = [];
    for(let i = 0; i < lines.length; i++)
        if(lines[i].s_time !== 0 && lines[i].e_time !== 0)
            newlines.push(lines[i]);

    lines = newlines;
}

/* Читаем субтитры из файла */
function readSubtitles(path) {
    if(subtitlesLoading)
        return;

    /* Если файл ass то запускаем библиотеку для этого */
    if(path.includes('.ass')) {
        if(!octopusInstance) {
            octopusInstance = new SubtitlesOctopus({
                video: document.querySelector('video'),
                subUrl: path,
                workerUrl: './js/subtitles-octopus-worker.js'
            });

            return;
        }
        
        octopusInstance.setTrackByUrl(path);

        return;
    }

    if(octopusInstance) {
        octopusInstance.dispose();
        octopusInstance = null;
    }

    subtitlesLoaded = false;
    subtitlesLoading = true;

    /* Чтение по строчкам из файла */
    let lineReader = readLine.createInterface({
        input: fs.createReadStream(path)
    });

    lines = [];
    currentIndex = 0;

    /* Новая линия из файла */
    lineReader.on('line', async (line) => await pushLine(line));

    lineReader.on('error', (err) => showError(err));

    /* Файл закончился */
    lineReader.on('close', () => {
        subtitlesLoaded = true;
        subtitlesLoading = false;
        $('#subtitlesblock').show();

        clearNullSubtitles();

        showMessage('字幕をアップロードしました');
    });
}

/* Получение расширения файла */
function getFileExtenstion(path) {
    let ext = path.split('.');
    return ext[ext.length - 1];
}

/* Проверка, если файл субтитры */
function isSupportedSubtitles(path) {
    let ext = getFileExtenstion(path);
    return ext === 'srt' || ext === 'ass';
}

/* Проверка, если файл видео */
function isVideo(path) {
    let ext = getFileExtenstion(path);
    return ext === 'mp4' || ext === 'mkv' /* || ext === 'avi' || ext === 'wmv' */ || ext === 'flv';
}

/* Текст в секунды */
function strToSecs(str) {
    let splitted = str.split(':');
    
    return parseInt(splitted[0]) * 3600 + parseInt(splitted[1]) * 60 + parseFloat(splitted[2].replace(',', '.'));
}

/* Получение субтитров для текущего отрезка времени */
function getSubtitles(time) {

    if(!lines || lines.length === 0 || !subtitlesLoaded)
        return null;
    
    for(let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        if(currentSubtitle && currentSubtitle !== null && lines[currentSubtitle].visible)
            lines[currentSubtitle].visible = false;

        if(time >= (line.s_time + settings.offset) && time <= (line.e_time + settings.offset)) {
            currentSubtitle = i;
            lines[currentSubtitle].visible = true;
            break;
        }
    }
    
    return lines[currentSubtitle];
}

/* Показ сообщения */
function showMessage(text) {
    if(hiddenNotifTimeoutID) {
        clearTimeout(hiddenNotifTimeoutID);
        hiddenNotifTimeoutID = undefined;
    }

    $('#notifications').removeClass('red');
    $('#notifications').addClass('green');

    $('#notifications').show();

    $('#notifications .text').html(text);

    hiddenNotifTimeoutID = setTimeout(() => $('#notifications').hide(), 5000);
}

/* Показ ошибки */
function showError(text) {
    if(hiddenNotifTimeoutID) {
        clearTimeout(hiddenNotifTimeoutID);
        hiddenNotifTimeoutID = undefined;
    }

    $('#notifications').removeClass('green');
    $('#notifications').addClass('red');

    $('#notifications').show();

    $('#notifications .text').html(text);

    hiddenNotifTimeoutID = setTimeout(() => $('#notifications').hide(), 5000);
}

/* Удаляем мусор с текста */
function replaceTrash(str) {
    return str.replace('.mkv', '')
              .replace('.mp4', '')
              .replace(' (1080p BD)', '')
              .replace(' (1920x1080 HEVC2 AAC)', '')
              .replace('[MTBB] ', '')
              .replace('[FFF] ', '')
              .replace(' [BD][1080p-FLAC]', '')
              .replace('[HorribleSubs] ', '')
              .replace(' [1080p]', '')
              .replace(' [720p]', '')
              .replace('[Ohys-Raws] ', '')
              .replace('(BS11 1280x720 x264 AAC)', '')
              .replace('.srt', '')
              .replace('.ass', '');
}

/* ОПолучаем список видео с сервера */
function getVideos() {
    return new Promise((resolve, reject) => {
        /* Запрос на сервер для получение списка видео */
        $.ajax( 'http://127.0.0.1:3000/getvideolist' )
        .done((data) => {
            videoList = data.videos;

            $('.yummy-catalog .catalog-itemsv2').html('');

            $('.yummy-catalog .searchbar').hide();
            $('.yummy-catalog .pages').hide();

            for(let i = 0; i < videoList.length; i += 1) {
                if(i >= videoList.length)
                    return;

                let sub = videoList[i].split('/');

                $('.yummy-catalog .catalog-itemsv2').append(`
                <div class="anime-item" videoID="${i}">
                    <div class="anime-item-in">
                        <div class="title"><p>${replaceTrash(sub[sub.length - 1])}</p></div>
                        <img class="poster" src="http://127.0.0.1:3000/getthumbnail/${i}">
                    </div>
                </div>`);
            }

            /* Действие, при нажатии на видео */
            $('.anime-item .anime-item-in').on('click', (e) => {
                let videoID = $($(e.currentTarget).parent()).attr('videoID');
                if(!videoID || !videoList[videoID]){
                    showError('Can\'t find video with id ' + videoID);
                    return;
                }
                
                setupPlayer('http://127.0.0.1:3000/getvideo/' + videoID);
            });

            resolve();

        }).fail(() => {
            showError('Can\'t load video list. Check the server!');
            resolve();
        });
    });
}

function getFormat(src) {
    if(src.includes('m3u8'))
        return 'application/x-mpegURL';

    return 'video/webm';
}

/* Устанавливаем ссылку в плеер и показываем его */
function setupPlayer(src) {
    player.src({ type: getFormat(src), src: src });

    lines = [];
    
    player.trigger('subtitlesUpdates', null);

    player.volume(settings.volume);

    $('.video-js').css('display', 'block');

    $('.drophere').hide();
    $('.down-menu').hide();
    $('.yummy-catalog').hide();
    $('.returntolist').show();
    $('.anime-page').hide();
    player.play();
}

/* Получаем текст субтитров с сервера */
function getSubtitlesFiles() {
    $.ajax( 'http://127.0.0.1:3000/getsubtitleslist' )
    .done((data) => {
        subtitlesList = data.subtitles;
        
        if(player)
            player.trigger('subtitlesUpdates', subtitlesList);

    }).fail(() => {
        showError('Can\'t load subtitles list. Check the server!');
    });
}

/* Открываем модалку */
function openModal(name) {
    $('.modal.' + name).css('display', 'flex');
}

/* Открываем модалку */
function closeModal(name) {
    $('.modal.' + name).css('display', '');
}

let mainurl = 'https://yummyanime.club'

/* Получаем каталог */
function getYummyCatalog(page, search) {
    page = page || 1;
    search = search || false;
    isSearching = false;

    if(search) {
        search = encodeURIComponent(search);
        isSearching = true;
    }
    /* 
        Promise это для торможения кода, то есть, пока мы не выполним resolve()
        внутри, то код, где вызвана эта функция, дальше не пойдёт 
    */
    return new Promise(async (resolve, reject) => {
        /* Получаем html */
        let $ = '';
        try {
            $ = await cloudscraper.get(mainurl + (!search ? '/catalog?page=' + page : '/search?word=' + search + '&page=' + page));
    
            $ = cheerio.load($);
        } catch(ex) {
            console.log(ex);
            reject('Невозможно пройти CloudFlare');
            return;
        }
    
        let anime_list = $('.anime-column'),
            anime_valid_list = { anime: [], pages: [] };

        /* У нас получился массив блоков с аниме, проходимся по каждому */
        Array.from(anime_list).forEach(anime => {
            anime = $(anime);
            let status = $($(anime.find('.status-label'))).html();
            let year = $($(anime.find('.year-block'))).html() || '2020';
            let poster = $($(anime.find('img'))).attr('src');
            let title = $($(anime.find('.anime-title'))).html();
            let link = $($(anime.find('.anime-title'))).attr('href');
    
            anime_valid_list.anime.push({ status: status, year: year, poster: poster, title: title, link: link });
        });

        let pages = $($($('.pagination')[0]).find('li'));

        Array.from(pages).forEach(pg => {
            pg = $(pg);

            let isActive = pg.hasClass('active');

            let page = pg.html();

            let isDisabled = pg.hasClass('disabled') || page.includes('...');

            if(pg.find('a').length > 0)
                page = $(pg.find('a')).html();

            if(pg.find('span').length > 0)
                page = $(pg.find('span')).html();

            if(page == '&#xAB;')
                page = '<i class="fa fa-chevron-left" aria-hidden="true"></i>';

            if(page == '&#xBB;')
                page = '<i class="fa fa-chevron-right" aria-hidden="true"></i>';

            anime_valid_list.pages.push({ page: page, isActive: isActive, isDisabled: isDisabled });
        });

        resolve(anime_valid_list);
    });
}

/* Переводим кракозябры в текст */
function escapeUnicode(str) {
    str = str.replace(/&#x/g, "\\u0").replace(/;/g, '');
    return str.replace(/\\u([0-9a-fA-F]+)/g, function() {
        return String.fromCharCode(parseInt(arguments[1], 16));
    });
}

/* Получаем инфо о аниме */
function getYummyPage(url) {
    /* 
        Promise это для торможения кода, то есть, пока мы не выполним resolve()
        внутри, то код, где вызвана эта функция, дальше не пойдёт 
    */
    return new Promise(async (resolve, reject) => {
        let $ = '';
        try {
            $ = await cloudscraper.get('https://yummyanime.club' + url);
    
            $ = cheerio.load($);
        } catch(ex) {
            reject('Невозможно пройти CloudFlare');
            return;
        }
        
        let anime_info = {};
    
        anime_info.title = escapeUnicode($('.anime-page h1').html()).trim();
        anime_info.poster = $('.poster-block img').attr('src');

        let main_info = Array.from($($('.content-main-info')[0]).children());
        main_info.forEach(li => {
            let text = $(li).text().trim();
            if(text.includes('Год:')) {
                anime_info.year = text.replace('Год: ', '');
                return;
            }
            if(text.includes('Сезон:')) {
                anime_info.season = text.replace('Сезон: ', '');
                return;
            }
            if(text.includes('Статус:')) {
                anime_info.status = text.replace('Статус:', '').trim();
                return;
            }
            if(text.includes('Серии:')) {
                anime_info.series = text.replace('Серии: ', '');
                return;
            }
            if(text.includes('Тип:')) {
                anime_info.type = text.replace('Тип: ', '');
                return;
            }
        });

        let genres = Array.from($($('.anime-page .categories-list')[0]).children());

        anime_info.genres = [];

        genres.forEach(li => {
            let a = $($(li).find('a'));
			if(!a.html())
				return;
			
            anime_info.genres.push({ link: a.attr('href'), name: escapeUnicode(a.html()).trim() });
        });

        let video_blocks = Array.from($('.video-block'));
        anime_info.players = [];

        video_blocks.forEach(block => {
            block = $(block);

            let desc = $(block.find('.video-block-description')).html();

            if(desc.includes('Трейлер'))
                return;

            desc = escapeUnicode(desc);
            let translator = desc.match(/ (.*)\./g);

            if(desc.includes('Субтитры'))
                translator = 'Субтитры';
            else if(translator && translator.length !== 0)
                translator = translator[0].replace(/\./g, '').trim();
            else
                translator = 'Озвучка';

            let video_buttons = Array.from($(block.find('.video-button')));

            video_buttons.forEach(button => {
                let link = $(button).attr('data-href');

                if(link.includes('youtube'))
                    return;
    
                if(link.includes('allohastream'))
                    anime_info.players.push({ type: 'alloha', translator: translator, link: link, serie: $(button).html() });
    
                if(link.includes('aniqit') || link.includes('kodik'))
                    anime_info.players.push({ type: 'kodik', translator: translator, link: link, serie: $(button).html() });

                if(link.includes('sibnet.ru'))
                    anime_info.players.push({ type: 'sibnet', translator: translator, link: link, serie: $(button).html() });
            });
        });

        resolve(anime_info);
    });
}

const request = require('request');
/* Отправка GET запроса на сервер */
function makeRequest(url, callback) {
    request.get({
        url:     url
    }, (error, response, body) => {
        callback(body);
    });
}

/* Отправка POST запроса на сервер */
function makePostRequest(url, data, callback, external_headers) {
    external_headers = external_headers || {};
    data = data || '';
    request.post({
        headers: {
            'content-type' : 'application/x-www-form-urlencoded',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'dnt': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.122 Safari/537.36',
            ...external_headers
        },
        url:     url,
        body:    data
    }, (error, response, body) => {
        callback(response, body);
    })
}
/*
1 https://video.sibnet.ru/v/0c0b1652c265f90aad369c71fb0d29ad/3529035.mp4
*/
/* Ломаем сибнет */
function fuckSibnet(link) {
    return new Promise((resolve, reject) => {
        makeRequest(link, (body) => {
            let bilink = 'https://video.sibnet.ru' + body.match(/player\.src\(\[\{src: \"(.+)\", type/g)[0].replace('player.src([{src: "', '').replace('", type', '');
            makePostRequest(bilink, '', (response, body) => {
                resolve(response.headers.location);
            }, {
                'Host': 'video.sibnet.ru',
                'Referer': link,
                'Connection': 'keep-alive',
                'Accept-Encoding': 'identity;q=1, *;q=0',
                'Accept-Language': 'ru,ja;q=0.9,ru-RU;q=0.8,en-US;q=0.7,en;q=0.6,uk;q=0.5,und;q=0.4',
            });
        });
    });
}

/* Ломаем кодик */
const formurlencoded = require('form-urlencoded').default;
function fuckKodik(link) {
    return new Promise((resolve, reject) => {
        makeRequest('http:' + link, (body) => {
            if(!body) {
                resolve('');
                return;
            }

            let html = body.split(/\r?\n/);
    
            for(let i = 0; i < html.length; i++) {
                let elem = html[i];
                if(elem.includes('iframe.src')) {
                    let link = elem.match(/iframe.src = "(.+)";/)[1];
                    makeRequest('http:' + link, (body) => {
                        html = body.split(/\r?\n/);
                        let data = {};
    
                        data.bad_user = true;
                        data.hash2 = 'OErmnYyYA4wHwOP';
    
                        for(let i = 0; i < html.length; i++) {
                            elem = html[i];
                            if(elem.includes('var domain')) {
                                data.d = elem.match(/var domain = "(.+)";/)[1];
                                continue;
                            }
                            if(elem.includes('var d_sign')) {
                                data.d_sign = elem.match(/var d_sign = "(.+)";/)[1];
                                continue;
                            }
                            if(elem.includes('var pd ')) {
                                data.pd = elem.match(/var pd = "(.+)";/)[1];
                                continue;
                            }
                            if(elem.includes('var pd_sign')) {
                                data.pd_sign = elem.match(/var pd_sign = "(.+)";/)[1];
                                continue;
                            }
                            if(elem.includes('var ref =')) {
                                let ref = elem.match(/var ref = "(.+)";/);
    
                                if(ref && ref.length > 0)
                                    data.ref = ref[1];
                                else
                                    data.ref = '';
                                continue;
                            }
                            if(elem.includes('var ref_sign')) {
                                data.ref_sign = elem.match(/var ref_sign = "(.+)";/)[1];
                                continue;
                            }
                            if(elem.includes('videoInfo.hash = ')) {
                                data.hash = elem.match(/videoInfo.hash = '(.+)';/)[1];
                                continue;
                            }
                            if(elem.includes('videoInfo.type = ')) {
                                data.type = elem.match(/videoInfo.type = '(.+)';/)[1];
                                continue;
                            }
                            if(elem.includes('videoInfo.id = ')) {
                                data.id = elem.match(/videoInfo.id = '(.+)';/)[1];
                                continue;
                            }
    
                        }
    
                        makePostRequest('https://aniqit.com/get-vid', formurlencoded(data), (response, body) => {
                            body = JSON.parse(body);
    
                            resolve(body.links['720'][0].src);
                        });
                    });
                    break;
                }
            }
        });
    });
}

function loadDropDown(select) {
    let options = select.find('option'),
        menu = $('<div />').addClass('select-menu'),
        button = $('<div />').addClass('button'),
        list = $('<ul />'),
        arrow = $('<em />').prependTo(button);

    menu.addClass(select[0].className);

    options.each(function(i) {
        let option = $(this);
        list.append($('<li />').text(option.text()));
    });

    menu.css('--t', select.find(':selected').index() * -41 + 'px');
    select.wrap(menu);
    button.append(list).insertAfter(select);
    list.clone().insertAfter(button);
}

async function loadAnimeCatalog(page, search) {
    $('.context_menu').hide();
        $('.anime-page').hide();
        $('.yummy-catalog .catalog-itemsv2').html('');
        openModal('loader');
        
        let anime_list = await getYummyCatalog(page, search);
        
        /* Проходимся по массиву с аниме и выводим список */
        anime_list.anime.forEach(anime => {
            $('.yummy-catalog .catalog-itemsv2').append(`
            <div class="anime-item">
                <div class="anime-item-in" data-href="${anime.link}">
                    <div class="title"><p>${anime.title}</p></div>
                    <img class="poster" src="https://yummyanime.club/${anime.poster}">
                </div>
            </div>`);
        });

        function loadTranslators(anime_link, players, player) {
            console.log('loading translators for ' + player);
            let already = [];

            if($('.select-menu.translators').length > 0) {
                $('.select-menu.translators .button ul').html('');
                $('.select-menu.translators ul').html('');
                $('.select-menu.translators select').html('');
                $('.select-menu.translators').css('--t', '0');
            }

            let current_translator = '';

            let saved_anime = getSavedAnime(anime_link);

            players.filter((item, index, arr) => item.type === player).forEach((playerb, index, arr) => {
                if(already[playerb.translator])
                    return;

                if((saved_anime && saved_anime.player === player && saved_anime.translator === playerb.translator))
                    current_translator = playerb.translator;

                already[playerb.translator] = 1;
                if($('.select-menu.translators').length > 0) {
                    //$('.select-menu.translators .button ul').append(`<li>${playerb.translator}</li>`);
                    $('.select-menu.translators ul').append(`<li>${playerb.translator}</li>`);
                    $('.select-menu.translators select').append(`<option data-translator="${playerb.translator}">${playerb.translator}</option>`)
                    return;
                }
                $('.down_content .translators').append(`<option data-translator="${playerb.translator}">${playerb.translator}</option>`);
            });

            if(current_translator === '')
                current_translator = players.filter((item, index, arr) => item.type === player)[0].translator;

            $(`option[data-translator="${current_translator}"]`).attr('selected', 'selected');

            console.log('current_translator = ' + current_translator)

            loadSeries(anime_link, players, current_translator, player);

            if($('.select-menu.translators').length === 0)
                loadDropDown($('.down_content .translators'));

            $('.select-menu.translators > ul > li').on('click', (e) => {
                let curr = $(e.currentTarget);

                loadSeries(anime_link, players, curr.html(), player);
            });
        }

        function getSavedAnime(link) {
            for(let anime of settings.saved_anime)
                if(anime.link === link)
                    return anime;

            return undefined;
        }

        function loadSeries(anime_link, players, current_translator, type_player) {
            console.log('loading series for ' + type_player + ' with ' + current_translator);

            if($('.down_content .series').length === 0)
                $('.down_content').append('<ul class="series"></ul>');

            let saved_anime = getSavedAnime(anime_link);

            $('.down_content .series').html('');
            players.forEach((player, index, arr) => {
                if(player.type !== type_player || player.translator !== current_translator)
                    return;

                $('.down_content .series').append(`<li data-href="${player.link}" data-player="${player.type}" class="serie` + (saved_anime && saved_anime.translator === current_translator && saved_anime.player === type_player && saved_anime.last_serie == player.serie ? ' active' : '') + `">${player.serie}</li>`);
            });

            /* Действие, при нажатии на серию */
            $('.down_content .series .serie').on('click', async (e) => {
                openModal('loader');
                let link = $(e.currentTarget).attr('data-href'),
                    player = $(e.currentTarget).attr('data-player'),
                    hacked = '';

                $('.down_content .series .active').removeClass('active');
                $(e.currentTarget).addClass('active');

                if(!saved_anime) {
                    settings.saved_anime.push({ link: anime_link, player: type_player, translator: current_translator, last_serie: 0 });
                    saved_anime = getSavedAnime(anime_link);
                }

                saved_anime.player = type_player;
                saved_anime.translator = current_translator;
                saved_anime.last_serie = $(e.currentTarget).html();
                saveSettings();

                console.log('player ' + player);
                switch(player) {
                    case 'alloha': {
                        hacked = await fuckAlloha(link);
                        break;
                    }
                    case 'sibnet': {
                        hacked = 'http:' + (await fuckSibnet(link));
                        break;
                    }
                    default: {
                        hacked = 'http:' + (await fuckKodik(link));
                    }
                }
                closeModal('loader');

                if(hacked === '' || hacked === 'http:') {
                    console.log('link is empty');
                    return;
                }

                console.log('original ' + link);
                console.log('hacked ' + hacked);
                setupPlayer(hacked);
            });
        }

        /* Действие, при нажатии на аниме */
        $('.anime-item .anime-item-in').on('click', async (e) => {
            e.preventDefault();
            openModal('loader');
            /* Парсим инфу о аниме */
            let info = await getYummyPage($(e.currentTarget).attr('data-href'));

            console.log(info);

            $('.upper_content').html('');
            $('.upper_content').append('<div class="data_text"></div>');

            $('.upper_content .data_text').append(`<div class="title">${info.title}</div>`);
            $('.upper_content .data_text').append('<ul class="info_left"></ul>');
            $('.upper_content .data_text .info_left').append(`<li><b>Статус:</b> ${info.status}</li>`);
            $('.upper_content .data_text .info_left').append(`<li><b>Год:</b> ${info.year}</li>`);
            $('.upper_content .data_text .info_left').append(`<li><b>Сезон:</b> ${info.season}</li>`);

            let genres = '';

            info.genres.forEach(genre => {
                genres += `<li><a href="${genre.link}">${genre.name}</a></li>`;
            });

            $('.upper_content .data_text .info_left').append(`<li><b>Жанры:</b> <ul class="categories-list">${genres}</ul></li>`);

            if(info.series)
                $('.upper_content .data_text .info_left').append(`<li><b>Серии:</b> ${info.series}</li>`);

            $('.upper_content .data_text .info_left').append(`<li><b>Тип:</b> ${info.type}</li>`);

            $('.upper_content').append('<div class="poster"></div>');
            $('.upper_content .poster').append(`<img src="https://yummyanime.club/${info.poster}">`);

            $('.down_content').html('');
            $('.down_content').append('<div class="line"></div>');

            let available_players = [];

            info.players.forEach(player => {
                if(!available_players[player.type])
                    available_players[player.type] = 1;
            });

            $('.down_content').append('<select class="players"></select>');
            $('.down_content').append('<select class="translators"></select>');

            let anime_link = $(e.currentTarget).attr('data-href');

            let saved_anime = getSavedAnime(anime_link);

            Object.keys(available_players).forEach((player, index, arr) => {
                $('.down_content .players').append(`<option` + (saved_anime && saved_anime.player === player ? ' selected' : '') + `>${player}</option>`);

                if((saved_anime && saved_anime.player === player) || !saved_anime && index === 0)
                    loadTranslators(anime_link, info.players, player);
            });

            loadDropDown($('.down_content .players'));

            $('.select-menu.players > ul > li').on('click', (e) => {
                let curr = $(e.currentTarget);

                loadTranslators(anime_link, info.players, curr.html());
            });

            $('.yummy-catalog').hide();
            $('.anime-page').css('display', 'flex');
            closeModal('loader');

            /* DOWN
            <div class="line"></div>
            <ul class="series">
                <li class="serie">1</li>
                <li class="serie">2</li>
            </ul>
            */

            /* UPPER
            <div class="data_text">
                <div class="title">Tasdas</div>
                <ul>
                    <li><b>Статус: </b>онгоинг</li>
                    <li><b>Год: </b>2020</li>
                    <li><b>Сезон: </b>Весна</li>
                    <li><b>Жанр: </b>Сэйнэн, Драма, Романтика, Исторический, Повседневность</li>
                    <li><b>Первоисточник: </b>Манга</li>
                    <li><b>Студия: </b>Seven Arcs</li>
                    <li><b>Режиссер: </b>Seven Arcs</li>
                    <li><b>Тип: </b>Сериал</li>
                    <li><b>Серии: </b>12</li>
                    <li><b>Перевод: </b>Seven Arcs</li>
                    <li><b>Озвучка: </b>Seven Arcs</li>
                    <li>На дворе начало XVI века. Колыбель эпохи Ренессанса, время настоящего расцвета искусства. Действия перенесут нас в Италию, город Флоренция, и история расскажет нам о молодой девушке по имени Арте, которая принадлежит знатному роду аристократов. Её заветная мечта — стать художницей, но в то время данная профессия считалась сугубо мужской. Единственный способ для неё — работать подмастерьем у состоявшегося художника, однако это тоже невозможно в сложившемся обществе. Возмущённая такой дискриминацией, Арте пытается отринуть своё естество, но однажды она встречает Лео, который открывает ей дорогу к заветной мечте.</li>
                </ul>
            </div>
            <div class="poster">
                <img src="https://yummyanime.club/img/posters/1581174984.jpg">
            </div>
            */
        });

        $('.pages .series').html('');
        anime_list.pages.forEach(page => {
            $('.pages .series').append(`<li class="serie` + (page.isActive ? ' active' : '') + (page.isDisabled ? ' disabled' : '') + `">${page.page}</li>`);
        });

        $('.pages .series .serie').on('click', (e) => {
            let curr = $(e.currentTarget);

            if(curr.hasClass('disabled'))
                return;

            let page = curr.html();

            let currPage = $('.pages .series .serie.active').html();

            if(page.includes('fa-chevron-right'))
                page = parseInt(currPage) + 1;
            else if(page.includes('fa-chevron-left'))
                page = parseInt(currPage) - 1;

            loadAnimeCatalog(page, (isSearching ? $('.searchbar input').val() : ''));
        });

        $('.yummy-catalog .searchbar').css('display', 'flex');
        $('.yummy-catalog .pages').show();
        $('.yummy-catalog').css('display', 'flex');
        closeModal('loader');
}

onload = async () => {
    
    openModal('loader');

    /* Кнопки в татйтле (скрыть, на весь экран, закрыть) */
    const { BrowserWindow } = require('electron').remote;

    const windowB = BrowserWindow.fromId(1);

    $('#min-btn').on('click', () => windowB.minimize());
    $('#max-btn').on('click', () => {
        if (windowB.isMaximized())
            windowB.unmaximize();
        else
            windowB.maximize();
    });
    $('#close-btn').on('click', () => windowB.hide());

    /* Дроппер, когда кидаем чёт в плеер то это воспроизводится */
    let counter = 0;
    $('body').bind({
        dragenter: (e) => {
            e.preventDefault();
            counter++;
            
            $('.drophere').css('display', 'flex');
        },

        dragleave: (e) => {
            e.preventDefault(); 
            counter--;
            if (counter !== 0)
                return;

            $('.drophere').hide();
        },

        dragover: (e) => {
            e.preventDefault(); 
        },

        drop: (e) => {
            e.preventDefault();
            $('.drophere').hide();

            if(e.originalEvent.dataTransfer.files.length === 0 || !e.originalEvent.dataTransfer.files[0])
                return;

            let path = e.originalEvent.dataTransfer.files[0].path;

            if(player && isVideo(path)) {
                setupPlayer(path);
                return;
            }
            
            if(isSupportedSubtitles(path)) {
                readSubtitles(path);
                return;
            }
            
            showError('サポートされていないファイル形式: ' + getFileExtenstion(path));
        }
    });

    /* Действие при нажатии на главную страницу (закрываем меню открытое через ПКМ) */
    $('.content').on('click', (e) => {
        e.preventDefault();
            
        $('.context_menu').hide();
    });

    function makeContextDefault(e) {
        openModal('loader');
        e.preventDefault();

        $('.down-menu .items .active').removeClass('active');

        if(!$(e.currentTarget).hasClass('active'))
            $(e.currentTarget).addClass('active');
    }

    /* Действие при нажатии на иконку папки в нижнем меню */
    $('.local').on('click', async (e) => {
        makeContextDefault(e);

        await getVideos();
        getSubtitlesFiles();

        $('.yummy-catalog').css('display', 'flex');
        closeModal('loader');
    });

    /* Действие при нажатии на иконку аниме в нижнем меню */
    $('.anime').on('click', async (e) => {
        makeContextDefault(e);

        loadAnimeCatalog();
        
        //console.log(anime_list);
    });

    /* Действие при нажатии на "установить" в модалке "установить ссылку" */
    $('.set_own_url .set_own_url_js').on('click', (e) => {
        e.preventDefault();
        let own_url = $('.set_own_url .inputes').val();

        if(!own_url) {
            return;
        }

        setupPlayer(own_url);
        $('.modal.set_own_url').css('display', 'none');
        settings.own_url = own_url;
        saveSettings();
    });

    /* Действие при нажатии на "установить" в модалке "установить оффсет" */
    $('.set_offset .set_offset_js').on('click', (e) => {
        e.preventDefault();
        let offset_set = parseFloat($('.set_offset .inputes').val());

        //TODO: send error message
        if(isNaN(offset_set)){
            return;
        }

        $('.modal.set_offset').css('display', 'none');
        settings.offset = offset;
        saveSettings();
    });

    /* Действие при нажатии на чёрную область в модалке (закрываем её) */
    $('.modal_shadow').on('click', (e) => {
        e.preventDefault();

        let parent = $($(e.currentTarget).parent());
        
        if(parent.hasClass('loader'))
            return;

        parent.css('display', '');
    });

    /* Действие при нажатии на "установить свою ссылку" */
    $('.set_own_url_bs').on('click', (e) => {
        e.preventDefault();
        $('.context_menu').hide();
        openModal('set_own_url');
    });

    /* Действие при нажатии на "установить оффсет" */
    $('.context_menu .set_offset').on('click', (e) => {
        e.preventDefault();
        $('.context_menu').hide();
        openModal('set_offset');
    });

    $('.searchbar button').on('click', (e) => {
        e.preventDefault();
        loadAnimeCatalog(null, $('.searchbar input').val());
    });

    /* Действие при скроллинге, повышаем/понижаем громкость */
    $(window).on('mousewheel', (e) => {
        if($('.video-js').css('display') !== 'block' || !player)
            return;

        let isUp = e.deltaY === 1;

        if(isUp) {

            if(player.volume() < 1)
                player.volume(player.volume() + 0.05);

        } else if(player.volume() !== 0)
            player.volume(player.volume() - 0.05);
    });

    /* Действие при ПКМ */
    $(window).contextmenu((e) => {
        e.preventDefault();

        if($('.modal:visible').length > 0)
            return;

        $('.context_menu').css({
            display: 'flex',
            top: e.pageY + 'px',
            left: e.pageX + 'px'
        });
    });

    /* Инициализация видеоплеера */
    videojs('my-video', {
        controls: true,
        preload: 'auto'
    }, async function onPlayerReady() {
        player = this;

        getVideos();
        getSubtitlesFiles();

        /* Каждые 25 секунд получаем новый список видео и т.д */
        setInterval(() => {
            if(!$('.yummy-catalog').is(':visible') || !$('.down-menu .items .active').hasClass('local'))
                return;

            getVideos();
            getSubtitlesFiles();
        }, 25000);

        if(this.player_.src()) {
            $('.yummy-catalog').hide();
            $('.drophere').hide();
            $('.returntolist').show();
            $('.video-js').css('display', 'block');
            $('.down-menu').hide();
        }

        /* Добавляем в плеер нужные компоненты, чтобы отображались и в видео на весь экран */
        this.player_.el().appendChild(document.getElementById('returntolist'));
        this.player_.el().appendChild(document.getElementById('subtitlesblock'));
        this.player_.el().appendChild(document.getElementById('notifications'));

        showMessage('プレーヤーがロードされました');

        /* Действие при возврате из плеера (кнопка слева вверху) */
        $('.returntolist').on('click', (e) => {
            e.preventDefault();

            player.pause();

            $(e.currentTarget).hide();
            $('#subtitlesblock').hide();
            $('.yummy-catalog').css('display', 'flex');

            $('.down-menu').css('display', 'flex');
            $('.video-js').css('display', 'none');

            $('#original').html('');
            $('#hiragana').html('');

            if(octopusInstance) {
                octopusInstance.dispose();
                octopusInstance = null;
            }
        });

        let hidetimer;

        /* Когда двигаем мышку */
        $(window).on('mousemove', () => {
            if(!$('.yummy-catalog').is(':hidden'))
                return;

            $('.returntolist').show();

            if(hidetimer) {
                clearTimeout(hidetimer);
                hidetimer = null;
            }

            if(player.paused())
                return;

            hidetimer = setTimeout(() => $('.returntolist').hide(), 2500);
        });

        /* При изминении звука - записываем в файл */
        this.on('volumechange', () => {
            settings.volume = this.player_.volume();
            saveSettings();
        });

        /* Когда меняется время в плеере (видео запущено) то делаем субтитры, если есть */
        this.on('timeupdate', () => {
            let time = this.player_.duration() - this.player_.remainingTime();

            let subtitle = getSubtitles(time);

            if(subtitle) {

                if(subtitle.visible) {
                    let original = $('#original');
                    if(original && original.html() != subtitle.lines)
                        original.html(subtitle.lines);
                        
                    let hiragana = $('#hiragana');
                    if(hiragana && hiragana.html() != subtitle.h_lines)
                        hiragana.html(subtitle.h_lines);
                } else {
                    $('#original').html('');
                    $('#hiragana').html('');
                }
            }
        });

        this.on('ended', () => videojs.log('Awww...over so soon?!'));
  
        videojs.registerComponent('subtitleSettings', loadSubtitlesComponent(player));

        this.controlBar.addChild('subtitleSettings');
    
        closeModal('loader');
    });

    $(document).on('click', '.select-menu', (e) => {
        let menu = $(e.currentTarget);
    
        if(!menu.hasClass('open'))
            menu.addClass('open');
        else
            menu.removeClass('open');
    });
    
    $(document).on('click', '.select-menu > ul > li', (e) => {
    
        let li = $(e.currentTarget),
            menu = li.parent().parent(),
            select = menu.children('select'),
            selected = select.find('option:selected'),
            index = li.index();
    
        menu.css('--t', index * -41 + 'px');
        selected.attr('selected', false);
        select.find('option').eq(index).attr('selected', true);
    
        menu.addClass(index > selected.index() ? 'tilt-down' : 'tilt-up');
    
        setTimeout(() => menu.removeClass('open tilt-up tilt-down'), 500);
    
    });
    
    $(document).click((e) => {
        e.stopPropagation();
        if($('.select-menu').has(e.target).length === 0)
            $('.select-menu').removeClass('open');
    })
    

    /* Субтитры занимают всю площадь, поэтому это костыль, чтобы видео останавливалось */
    $('#subtitlesblock').on('click', (e) => {
        e.preventDefault();
        
        if(player.paused())
            player.play();
        else
            player.pause();
    });

    loadSettings();
};