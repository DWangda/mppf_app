import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SplashComponent } from './components/splash/splash.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, CommonModule, SplashComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppComponent {
  webSplash = true;
  hasLoadedSplash = false;
  ngOnInit() {
    // Optional: wait for real startup work (tokens, settings, etc.)
    // setTimeout(() => {
    //   this.webSplash = false;
    //   this.hasLoadedSplash = true;
    // }, 3000); // hides after 1.2 s

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
}
