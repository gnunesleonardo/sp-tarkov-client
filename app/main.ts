import * as Store from 'electron-store';
import { UserSettingStoreModel } from '../shared/models/user-setting.model';
import { mainApplicationStart } from './main-application-start';
import { handleOpenDirectoryEvent } from './events/open-directory.event';
import { handleUserSettingStoreEvents } from './events/user-setting.event';
import { handleDownloadLinkEvent } from './events/download-link-file.event';
import { handleDownloadModEvent } from './events/download-mod.event';
import { handleFileUnzipEvent } from './events/file-unzip.event';
import { handleClientModsEvent } from './events/client-mods.event';
import { handleServerModsEvent } from './events/server-mods.event';
import { handleWindowEvents } from './events/window.event';
import { autoUpdater } from 'electron-updater';
import { handleClearTemporaryDirectoryEvent } from './events/clear-temp.event';
import { handleThemeEvents } from './events/theme.event';
import { handleTutorialEvents } from './events/tutorial.event';
import { handleTarkovStartEvent } from './events/tarkov-start.event';
import { handleExperimentalFunctionsEvents } from './events/experimental-functions.event';
import { handleModLoadOrderEvents } from './events/mod-load-order.event';
import * as log from 'electron-log';
import { handleUpdateModEvents } from './events/update-mod.event';
import { handleAkiTagEvents } from './events/aki-tag.event';
import { handleAkiVersionEvents } from './events/aki-version.event';
log.initialize();

const isServe = process.argv.slice(1).some(val => val === '--serve');
const store = new Store<UserSettingStoreModel>();
void autoUpdater.checkForUpdatesAndNotify();

mainApplicationStart(isServe, store);
handleOpenDirectoryEvent(store);
handleDownloadLinkEvent();
handleDownloadModEvent();
handleFileUnzipEvent(isServe);
handleUserSettingStoreEvents(store);
handleClientModsEvent();
handleServerModsEvent();
handleWindowEvents();
handleClearTemporaryDirectoryEvent();
handleThemeEvents(store);
handleTutorialEvents(store);
handleTarkovStartEvent();
handleExperimentalFunctionsEvents(store);
handleModLoadOrderEvents();
handleUpdateModEvents(store);
handleAkiTagEvents(store);
handleAkiVersionEvents(store);
