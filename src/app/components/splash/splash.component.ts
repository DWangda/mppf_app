import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  standalone: true,
  styleUrls: ['./splash.component.scss'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SplashComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
