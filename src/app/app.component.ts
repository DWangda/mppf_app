// import { CommonModule } from '@angular/common';
// import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
// import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
// import { SplashComponent } from './components/splash/splash.component';
// import { ContactPage } from './contact/contact.page';
// import { App } from '@capacitor/app';
// import { Router } from '@angular/router';
// @Component({
//   selector: 'app-root',
//   templateUrl: 'app.component.html',
//   imports: [IonApp, IonRouterOutlet, CommonModule, SplashComponent],
//   schemas: [CUSTOM_ELEMENTS_SCHEMA],
// })
// export class AppComponent {
//   webSplash = true;
//   hasLoadedSplash = false;
//   constructor(private router: Router) {}
//   ngOnInit() {
//     // Optional: wait for real startup work (tokens, settings, etc.)
//     // setTimeout(() => {
//     //   this.webSplash = false;
//     //   this.hasLoadedSplash = true;
//     // }, 3000); // hides after 1.2 s

//     const alreadyShown = localStorage.getItem('hasLoadedSplash');

//     if (!alreadyShown) {
//       this.webSplash = true;
//       setTimeout(() => {
//         this.webSplash = false;
//         localStorage.setItem('hasLoadedSplash', 'true');
//       }, 3000);
//     } else {
//       this.webSplash = false;
//     }
//     App.addListener('appUrlOpen', (data: any) => {
//       const url = data.url; // e.g. ngayoe://open/login
//       console.log('Deep link detected:', url);

//       if (!url) return;

//       // Parse the path after ngayoe://open/
//       const path = url.split('://open/')[1];
//       if (!path) return;

//       // Example: ngayoe://open/login
//       if (path.startsWith('login')) {
//         this.router.navigate(['/ndi-login']);
//       }

//       // Example: ngayoe://open/proof?session=123
//       if (path.startsWith('proof')) {
//         const session = new URL(url).searchParams.get('session');
//         this.router.navigate(['/proof', session]);
//       }
//     });
//   }
// }
import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, NgZone } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SplashComponent } from './components/splash/splash.component';
import { Router } from '@angular/router';

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, CommonModule, SplashComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppComponent {
  webSplash = true;
  hasLoadedSplash = false;

  private readonly isNative = Capacitor.isNativePlatform();

  constructor(private router: Router, private zone: NgZone) {
    this.initSplash();
    this.initDeepLinkCallbacks();
  }

  private initSplash() {
    const alreadyShown = localStorage.getItem('hasLoadedSplash');

    if (!alreadyShown) {
      this.webSplash = true;
      setTimeout(() => {
        this.webSplash = false;
        localStorage.setItem('hasLoadedSplash', 'true');
      }, 3000);
    } else {
      this.webSplash = false;
    }
  }

  private async initDeepLinkCallbacks() {
    // ✅ Only do this on native (Android/iOS)
    if (!this.isNative) return;

    // Cold start
    const launch = await CapApp.getLaunchUrl();
    if (launch?.url) this.handleCallbackUrl(launch.url);

    // Warm start
    await CapApp.addListener('appUrlOpen', (event) => {
      if (event?.url) this.handleCallbackUrl(event.url);
    });
  }

  private handleCallbackUrl(url: string) {
    console.log('[NDI][APP] 🔙 Callback URL received:', url);

    const lowered = (url || '').toLowerCase();
    if (!lowered.startsWith('ngayoe://')) return;

    const flow = localStorage.getItem('ndi_flow') || 'login'; // "login" | "liveness"
    const threadId = localStorage.getItem('ndi_threadId');

    console.log('[NDI][APP] ✅ flow=', flow);
    console.log('[NDI][APP] ✅ threadId=', threadId);

    this.zone.run(() => {
      if (flow === 'liveness') {
        console.log('[NDI][APP] ➜ navigating /liveness?resume=1');
        this.router.navigate(['/liveness'], { queryParams: { resume: 1 } });
      } else {
        console.log('[NDI][APP] ➜ navigating /ndi-login?resume=1');
        this.router.navigate(['/ndi-login'], { queryParams: { resume: 1 } });
      }
    });
  }
}
