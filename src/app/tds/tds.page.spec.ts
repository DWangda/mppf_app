import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TDSPage } from './tds.page';

describe('TDSPage', () => {
  let component: TDSPage;
  let fixture: ComponentFixture<TDSPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TDSPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
