﻿import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { serverModPath } from '../shared/constants';

export const handleServerModsEvent = () => {
  ipcMain.on('server-mod', async (event, akiInstancePath: string) => {
    try {
      if (fs.existsSync(akiInstancePath)) {
        const rootServerPath = path.join(akiInstancePath, serverModPath);
        const dirs = fs
          .readdirSync(rootServerPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory() && dirent.name !== 'spt')
          .map(dirent => dirent.name);

        const data = [];
        for (let dir of dirs) {
          const filePath = path.join(rootServerPath, dir, 'package.json');
          if (fs.existsSync(filePath)) {
            const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const { name, version, akiVersion } = packageJson;
            if (name && version && akiVersion) {
              data.push({ name, version, akiVersion });
            }
          }
        }

        event.sender.send('server-mod-completed', data);
      }
    } catch (error) {
      console.error(error);
    }
  });
};