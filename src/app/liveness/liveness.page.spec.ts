import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LivenessPage } from './liveness.page';

describe('LivenessPage', () => {
  let component: LivenessPage;
  let fixture: ComponentFixture<LivenessPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(LivenessPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
