import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should keep the local calendar date when formatting challan dates', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as any;

    expect(app.formatDate('2026-11-16')).toBe('2026-11-16');
    expect(app.formatDate(new Date('2026-11-16T00:30:00+05:30'))).toBe('2026-11-16');
  });
});
