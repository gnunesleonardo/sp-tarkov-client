import { AfterViewInit, Component, DestroyRef, inject, Input, OnInit, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AsyncPipe, NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ElectronService } from '../../services/electron.service';
import { ModListService } from '../../services/mod-list.service';
import { UserSettingsService } from '../../services/user-settings.service';
import { Mod } from '../../models/mod';
import { restrictedModList } from '../../../constants';
import { IsAlreadyInstalledDirective } from '../../directives/is-already-installed.directive';
import { environment } from '../../../../environments/environment';
import { HtmlHelper } from '../../helper/html-helper';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { debounceTime, map, Observable, startWith, Subscription, tap } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { DownloadService } from '../../services/download.service';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { AkiTag, AkiVersion, ConfigurationService } from '../../services/configuration.service';
import { FileHelper } from '../../helper/file-helper';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatInput } from '@angular/material/input';
import { ErrorStateMatcher } from '@angular/material/core';

export type GenericModListSortField = 'cumulativeLikes' | 'time' | 'lastChangeTime' | 'downloads';
export type GenericModListSortOrder = 'ASC' | 'DESC';

@Component({
  standalone: true,
  selector: 'app-generic-mod-list',
  templateUrl: './generic-mod-list.component.html',
  styleUrl: './generic-mod-list.component.scss',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    MatTooltipModule,
    NgOptimizedImage,
    IsAlreadyInstalledDirective,
    MatPaginatorModule,
    MatToolbarModule,
    MatSelectModule,
    AsyncPipe,
    MatProgressSpinner,
    ReactiveFormsModule,
    NgTemplateOutlet,
    MatAutocomplete,
    MatInput,
    MatAutocompleteTrigger,
  ],
})
export default class GenericModListComponent implements OnInit, AfterViewInit {
  private paginatorSubscription: Subscription | undefined;
  private _sortField: GenericModListSortField = 'cumulativeLikes';
  @ViewChild(MatPaginator) paginator: MatPaginator | undefined;

  @Input() set sortField(sortValue: GenericModListSortField) {
    this._sortField = sortValue;
  }

  @Input() sortOrder: GenericModListSortOrder = 'DESC';
  @Input() tags: boolean | undefined;

  #httpClient = inject(HttpClient);
  #electronService = inject(ElectronService);
  #modListService = inject(ModListService);
  #userSettingsService = inject(UserSettingsService);
  #destroyRef = inject(DestroyRef);
  #downloadService = inject(DownloadService);
  #configurationService = inject(ConfigurationService);

  akiVersionFormField = new FormControl<AkiVersion | null>(null);
  akiTagFormField = new FormControl(null);
  filteredOptions: Observable<AkiTag[]> | undefined;

  accumulatedModList: Mod[] = [];
  pageSize = 0;
  pageLength = 0;
  pageNumber = 0;
  loading = false;
  isDownloadAndInstallInProgress = this.#downloadService.isDownloadAndInstallInProgress;

  akiVersionSignal = this.#configurationService.versionSignal;
  akiTagsSignal = this.#configurationService.tagsSignal;

  ngOnInit() {
    this.akiVersionFormField.valueChanges.subscribe(() => this.loadData(this._sortField, this.pageNumber));
    this.filteredOptions = this.akiTagFormField.valueChanges.pipe(
      startWith(''),
      debounceTime(500),
      map(value => this.filterAkiTags(value || '')),
      tap(() => this.loadData(this._sortField, this.pageNumber))
    );

    this.loadData(this._sortField, this.pageNumber);
  }

  ngAfterViewInit() {
    this.paginatorSubscription = this.paginator?.page
      .pipe(debounceTime(250), takeUntilDestroyed(this.#destroyRef))
      .subscribe((event: PageEvent) => this.loadData(this._sortField, event.pageIndex));
  }

  isActiveAkiInstanceAvailable = () => !!this.#userSettingsService.getActiveInstance();

  refresh() {
    this.loadData(this._sortField ?? 'cumulativeLikes', this.pageNumber);
  }

  addModToModList(mod: Mod) {
    this.#modListService.addMod(mod);
  }

  removeModFromModList(mod: Mod) {
    this.#modListService.removeMod(mod.name);
  }

  openExternal(modFileUrl: string) {
    void this.#electronService.shell.openExternal(modFileUrl);
  }

  getLastUpdateText(lastUpdate: Date | undefined): string {
    if (!lastUpdate) {
      return 'Unknown';
    }

    const now: Date = new Date();
    const diff: number = now.getTime() - lastUpdate.getTime();
    const seconds: number = Math.floor(diff / 1000);
    const minutes: number = Math.floor(seconds / 60);
    const hours: number = Math.floor(minutes / 60);
    const days: number = Math.floor(hours / 24);

    if (days > 0) {
      return days === 1 ? 'Yesterday, ' + lastUpdate.toLocaleTimeString() : `${days} days ago`;
    } else if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    } else if (minutes > 0) {
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    } else {
      return 'Just now';
    }
  }

  private filterCoreMods(mod: Mod) {
    return !restrictedModList.includes(mod.name);
  }

  private loadData(sortValue: GenericModListSortField, pageNumber = 0) {
    this.loading = true;
    const config = this.#configurationService.configSignal();
    let basePath = '';

    if (this.tags) {
      const akiTag = this.akiTagsSignal()?.find(t => t.innerText === this.akiTagFormField.value);
      if (!akiTag) {
        this.loading = false;
        this.accumulatedModList = [];
        return;
      }

      basePath = `${environment.akiFileTagBaseLink}${akiTag?.tagPath}?objectType=com.woltlab.filebase.file&pageNo=${pageNumber + 1}`;
    } else {
      basePath = `${environment.akiFileBaseLink}/?pageNo=${pageNumber + 1}&sortField=${sortValue}&sortOrder=${this.sortOrder}&labelIDs[1]=${this.akiVersionFormField.value?.dataLabelId}`;
    }

    this.accumulatedModList = [];

    this.#httpClient
      .get(basePath, { responseType: 'text' })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(pestRatedViewString => {
        const modView = HtmlHelper.parseStringAsHtml(pestRatedViewString);
        const modList = modView.body.getElementsByClassName('filebaseFileCard');

        const elements = modView.querySelectorAll('.paginationTop .pagination ul li:not([class])');
        const pageNumbers = Array.from(elements).map(li => parseInt(li.textContent ?? ''));

        this.accumulatedModList = Array.from(modList)
          .map(e => {
            const datetimeAttribute = e.querySelector('.filebaseFileMetaData .datetime')?.getAttribute('datetime');
            const date = datetimeAttribute ? new Date(datetimeAttribute) : undefined;

            return {
              name: e.getElementsByClassName('filebaseFileSubject')[0].getElementsByTagName('span')[0].innerHTML,
              fileUrl: e.getElementsByTagName('a')[0].href,
              image: e.getElementsByClassName('filebaseFileIcon')[0]?.getElementsByTagName('img')[0]?.src ?? null,
              icon: e.getElementsByClassName('filebaseFileIcon')[0]?.getElementsByTagName('span')[0]?.className.split('icon icon128')[1] ?? null,
              teaser: e.getElementsByClassName('filebaseFileTeaser')[0].innerHTML ?? '',
              supportedAkiVersion: e.getElementsByClassName('labelList')[0]?.getElementsByClassName('badge label')[0]?.innerHTML ?? '',
              akiVersionColorCode: e.getElementsByClassName('labelList')[0]?.getElementsByClassName('badge label')[0]?.className,
              kind: undefined,
              notSupported: false,
              lastUpdate: this.getLastUpdateText(date),
            } as Mod;
          })
          .filter(e => this.filterCoreMods(e))
          .map(e => {
            if (!config) {
              return e;
            }

            const fileId = FileHelper.extractFileIdFromUrl(e.fileUrl);
            if (!fileId) {
              return e;
            }

            e.notSupported = !!config.notSupported.find(f => f === +fileId);
            return e;
          });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        this.pageNumber = pageNumber;
        this.pageSize = this.accumulatedModList.length;
        this.pageLength = !!pageNumbers.length ? pageNumbers[pageNumbers.length - 1] * 20 : this.accumulatedModList.length;
        this.loading = false;
      });
  }

  private filterAkiTags(value: string): AkiTag[] {
    const filterValue = value.toLowerCase();
    if (!this.akiTagsSignal()?.length) {
      return [];
    }

    return this.akiTagsSignal()!.filter(option => option.innerText.toLowerCase().includes(filterValue));
  }
}
