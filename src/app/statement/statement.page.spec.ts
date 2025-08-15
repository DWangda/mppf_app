import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatementPage } from './statement.page';

describe('StatementPage', () => {
  let component: StatementPage;
  let fixture: ComponentFixture<StatementPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(StatementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
