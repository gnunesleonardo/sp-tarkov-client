﻿import { app, ipcMain } from 'electron';
import * as path from 'path';
import { clientModPath } from '../constants';
import * as fs from 'fs';
import * as log from 'electron-log';
import { ensureDirSync } from 'fs-extra';
import { readdirSync } from 'node:fs';

export const handleClientModsEvent = () => {
  ipcMain.on('client-mod', async (event, akiInstancePath: string) => {
    try {
      if (fs.existsSync(akiInstancePath)) {
        let data = [];
        const rootServerPath = path.join(akiInstancePath, clientModPath);
        const rootDllFiles = fs
          .readdirSync(rootServerPath, { withFileTypes: true })
          .filter(file => file.isFile() && path.extname(file.name) === '.dll')
          .map((f: any) => f);

        for (const file of rootDllFiles) {
          const version = await getVersion(path.join(file.path, file.name));
          data.push({
            name: file.name.split('.dll')[0],
            version,
            modPath: rootServerPath,
            modOriginalPath: path.join(file.path, file.name),
            modOriginalName: file.name,
            isEnabled: true,
          });
        }

        const rootDirectories = fs
          .readdirSync(rootServerPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory() && dirent.name !== 'spt')
          .map(dirent => dirent.name);

        for (let dir of rootDirectories) {
          const directoryDll = fs
            .readdirSync(path.join(rootServerPath, dir), { withFileTypes: true })
            .filter(file => file.isFile() && path.extname(file.name) === '.dll')
            .map((f: any) => f);

          if (directoryDll.length === 0) {
            continue;
          }

          const filePath = path.join(directoryDll[0].path, directoryDll[0].name);
          const version = await getVersion(filePath);
          data.push({
            isDirectory: true,
            name: dir,
            version,
            isEnabled: true,
            modOriginalPath: directoryDll[0].path,
            modOriginalName: dir,
            modPath: directoryDll[0].path,
            subMods: await Promise.all(
              directoryDll.map(async m => {
                const subModPath = path.join(directoryDll[0].path, m.name);
                return {
                  version: await getVersion(subModPath),
                  modPath: directoryDll[0].path,
                  name: m.name.split('.dll')[0],
                };
              })
            ),
          });
        }

        data = await checkForDisabledClientMods(data, akiInstancePath);

        event.sender.send('client-mod-completed', data);
      }
    } catch (error: any) {
      event.sender.send('client-mod-error', { error, isPowerShellIssue: error.isPowerShellIssue });
      log.error(error);
    }
  });
};

async function getVersion(dllFilePath: string) {
  try {
    const exec = require('util').promisify(require('child_process').exec);
    const { stderr, stdout } = await exec(`powershell "[System.Diagnostics.FileVersionInfo]::GetVersionInfo('${dllFilePath}').FileVersion`);

    if (stderr) {
      return stderr;
    }

    return stdout;
  } catch (error) {
    throw { error, isPowerShellIssue: true };
  }
}

function checkForDisabledClientMods(data: any[], akiInstancePath: string): Promise<any[]> {
  return new Promise<any[]>(async (resolve, reject) => {
    try {
      const appPath = app.getPath('userData');
      const instanceName = akiInstancePath.split('\\').pop();
      if (!instanceName) {
        return data;
      }

      const instanceClientDisabledModPath = path.join(appPath, 'instances', instanceName, 'disabled', 'client');
      ensureDirSync(instanceClientDisabledModPath);

      const disabledClientMods = readdirSync(instanceClientDisabledModPath, { withFileTypes: true });
      for (const mod of disabledClientMods) {
        const filePath = path.join(instanceClientDisabledModPath, mod.name);
        let version = '';

        if (mod.isFile()) {
          version = await getVersion(filePath);

          data.push({
            name: mod.name.split('.dll')[0],
            version,
            modPath: instanceClientDisabledModPath,
            modOriginalPath: path.join(instanceClientDisabledModPath, mod.name),
            modOriginalName: mod.name,
            isEnabled: false,
          });
        } else if (mod.isDirectory()) {
          const subMods = readdirSync(filePath, { withFileTypes: true });
          const subModObjects = await Promise.all(
            subMods
              .filter(file => file.isFile() && path.extname(file.name) === '.dll')
              .map(async m => ({
                version: await getVersion(path.join(filePath, m.name)),
                modPath: filePath,
                name: m.name.split('.dll')[0],
              }))
          );

          data.push({
            name: mod.name,
            modPath: filePath,
            modOriginalPath: filePath,
            modOriginalName: mod.name,
            isEnabled: false,
            isDirectory: true,
            subMods: subModObjects,
          });
        }
      }

      resolve(data);
    } catch (e) {
      console.log(e);
    }
  });
}
