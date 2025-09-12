/**************************************************************************
 * language-toggle.component.ts  –  Stand-alone component
 * -----------------------------------------------------------------------
 * • Shows a toggle that switches between 'en' and 'dz'
 * • Persists the choice in localStorage
 * • Works with @ngx-translate (must already be configured at root)
 **************************************************************************/

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonItem, IonLabel, IonToggle } from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  imports: [
    CommonModule,
    IonLabel,
    IonToggle,
    TranslateModule, // needed for the | translate pipe
  ],
  template: `
    <div
      class="ion-padding"
      style="display: flex; align-items: center; color: #000"
    >
      <ion-label>{{ 'English' | translate }}</ion-label>

      <ion-toggle
        style="margin: 0 10px; --handle-background-checked: white; --track-background-checked: black; --handle-background: black; --handle-border-color: black;
    --handle-border-width: 1px;"
        [checked]="isDz"
        (ionChange)="toggle($event)"
      >
      </ion-toggle>
      <ion-label>{{ 'Dzongkha' | translate }}</ion-label>
    </div>
  `,
})
export class LanguageToggleComponent {
  /** whether the toggle is in Dzongkha position */
  isDz = localStorage.getItem('lang') === 'dz';

  // inject lazily to avoid circular-DI traps
  private translate = inject(TranslateService);

  ngOnInit() {
    /** Make sure both languages are registered once per app run */
    this.translate.addLangs(['en', 'dz']);

    // If nothing stored yet, use browser language (optional)
    const initial =
      localStorage.getItem('lang') ?? this.translate.getBrowserLang() ?? 'en';

    this.translate.use(initial);
  }

  /** Flip language and persist choice */
  toggle(ev: CustomEvent) {
    const lang = ev.detail.checked ? 'dz' : 'en';
    this.isDz = ev.detail.checked;
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
  }
}
