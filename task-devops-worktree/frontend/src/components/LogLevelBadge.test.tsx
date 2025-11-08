import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/test-utils';
import LogLevelBadge from './LogLevelBadge';

describe('LogLevelBadge', () => {
  it('renders ERROR level with correct styling', () => {
    render(<LogLevelBadge level="ERROR" />);
    const badge = screen.getByText('ERROR');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-destructive/20');
    expect(badge).toHaveClass('text-destructive-foreground');
    expect(badge).toHaveClass('font-mono');
  });

  it('renders WARN level with correct styling', () => {
    render(<LogLevelBadge level="WARN" />);
    const badge = screen.getByText('WARN');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-amber-400/20');
    expect(badge).toHaveClass('text-amber-200');
  });

  it('renders INFO level with correct styling', () => {
    render(<LogLevelBadge level="INFO" />);
    const badge = screen.getByText('INFO');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-sky-500/20');
    expect(badge).toHaveClass('text-sky-200');
  });

  it('renders DEBUG level with correct styling', () => {
    render(<LogLevelBadge level="DEBUG" />);
    const badge = screen.getByText('DEBUG');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-muted-foreground');
  });

  it('has correct base styling', () => {
    render(<LogLevelBadge level="INFO" />);
    const badge = screen.getByText('INFO');
    expect(badge).toHaveClass('inline-flex', 'min-w-[48px]', 'font-mono');
  });

  it('displays the level text correctly', () => {
    render(<LogLevelBadge level="ERROR" />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });
});
