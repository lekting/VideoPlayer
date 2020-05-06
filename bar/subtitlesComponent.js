function loadSubtitlesComponent(player) {
    let MenuItem = videojs.getComponent('MenuItem'),
        _ = require('underscore');

    let QualityOption = videojs.extend(MenuItem, {

        constructor: function(player, options) {
            var source = options.source;

            options = _.extend({
                selectable: true,
                label: source,
            }, options);

            MenuItem.call(this, player, options);

            this.source = source;
        },

        handleClick: function(event) {
            this.player().trigger('subtitlesUpdates', this.source);
        },

    });

    let MenuButton = videojs.getComponent('MenuButton');
    return videojs.extend(MenuButton, {

        constructor: function(player, options) {
            MenuButton.call(this, player, options);

            this.subtitlesList = null;

            player.one('ready', function() {
                this.update();
                this.show();
            }.bind(this));

            this.controlText('Open subtitle selector menu');
            
            player.on('subtitlesUpdates', function(cmp, subtitles) {
                if((subtitles && Array.isArray(subtitles)) || subtitles === null) {
                    if(subtitles)
                        this.subtitles = subtitles;

                    if(player.currentSrc()) {
                        let currentID = player.currentSrc().split('/');
                            currentID = currentID[currentID.length - 1];

                        if(!currentID || !videoList[currentID]) {
                            this.hide();
                            return;
                        }

                        let currentAnime = videoList[currentID].split('/');

                        if(currentAnime.length === 0) {
                            this.hide();
                            return;
                        }

                        currentAnime = currentAnime[0];

                        let newSubtitles = [];
                        for(let i = 0; i < this.subtitles.length; i++) {
                            let subtitle = this.subtitles[i];
                            if(subtitle.anime === currentAnime)
                                newSubtitles.push({ id: i, name: subtitle.name });
                        }
                        this.subtitlesList = newSubtitles;
                    }

                    this.update();
                    return;
                }

                if(!this.subtitlesList) {
                    this.hide();
                    return;
                }
                
                for(let i = 0; i < this.subtitlesList.length; i++) {
                    let subtitle = this.subtitlesList[i];
                    let subtitlename = subtitle.name.split('/');
                        subtitlename = replaceTrash(subtitlename[subtitlename.length - 1]);

                    if(subtitlename == subtitles) {
                        readUrlSubtitles(subtitle.id);
                        break;
                    }
                }
                this.update();
            }.bind(this));
        },

        setSelectedSource: function(source) {

        },

        createItems: function() {
            if (!this.subtitlesList)
                return null;

            return _.map(this.subtitlesList, function(source) {
                let realname = source.name.split('/');
                return new QualityOption(player, {
                    source: replaceTrash(realname[realname.length - 1]),
                });
            }.bind(this));
        },

        buildWrapperCSSClass: function() {
            return 'vjs-quality-selector ' + MenuButton.prototype.buildWrapperCSSClass.call(this);
        },

    });
}