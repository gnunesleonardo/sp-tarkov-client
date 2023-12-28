﻿export type applicationElectronEventNames =
  | 'open-directory'
  | 'user-settings'
  | 'user-settings-update'
  | 'user-settings-remove'
  | 'download-link'
  | 'download-mod'
  | 'file-unzip';
export type applicationElectronFileProgressEventNames = 'download-mod-progress';

export enum ApplicationElectronFileError {
  unzipError,
  downloadError,
  downloadLinkError,
}
