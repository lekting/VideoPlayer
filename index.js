const { app, BrowserWindow, Tray, Menu } = require('electron');

app.commandLine.appendSwitch("--ignore-certificate-errors");
app.on('ready', () => {
    // Создаем окно браузера.
    let win = new BrowserWindow({
        title: 'Videoplayer',
        width: 1300,
        height: 700,
        minHeight: 500,
        minWidth: 940,
        backgroundColor: '#fff',
        icon: __dirname + '/logo.png',
        frame: false,
        transparent: false,
        show: false,
        webPreferences: {
            nodeIntegration: true
        }
    });

    /*let tray = new Tray('./icon.ico');

    tray.setToolTip('VideoPlayer by lekting');
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: 'Open VideoPlayer',
            click: () => {
                win.show();
            }
        },
        {
            label: 'Exit',
            click: () => {
                tray.destroy();
                app.quit();
            }
        }
    ]));*/

    win.loadURL(`file://${__dirname}/bar/index.html`);

    win.webContents.on('new-window', (e, windowURL) => {
        e.preventDefault();
        electron.shell.openExternal(windowURL);
    });

    win.on('closed', () => {
        tray.destroy();
        app.quit();
    });

    win.webContents.on('did-finish-load', function() {
        win.show();
    });

    app.on('window-all-closed', () => {
        tray.destroy();
        app.quit();
    });
});