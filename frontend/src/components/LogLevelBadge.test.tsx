import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/test-utils';
import LogLevelBadge from './LogLevelBadge';

describe('LogLevelBadge', () => {
  it('renders ERROR level with correct styling', () => {
    render(<LogLevelBadge level="ERROR" />);
    const badge = screen.getByText('ERROR');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: '#dc3545',
      color: '#fff',
    });
  });

  it('renders WARN level with correct styling', () => {
    render(<LogLevelBadge level="WARN" />);
    const badge = screen.getByText('WARN');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: '#ffc107',
      color: '#000',
    });
  });

  it('renders INFO level with correct styling', () => {
    render(<LogLevelBadge level="INFO" />);
    const badge = screen.getByText('INFO');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: '#17a2b8',
      color: '#fff',
    });
  });

  it('renders DEBUG level with correct styling', () => {
    render(<LogLevelBadge level="DEBUG" />);
    const badge = screen.getByText('DEBUG');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: '#6c757d',
      color: '#fff',
    });
  });

  it('has correct base styling', () => {
    render(<LogLevelBadge level="INFO" />);
    const badge = screen.getByText('INFO');
    expect(badge).toHaveStyle({
      display: 'inline-block',
      padding: '2px 6px',
      borderRadius: '3px',
      fontSize: '11px',
      fontWeight: '600',
      fontFamily: 'monospace',
      minWidth: '50px',
      textAlign: 'center',
    });
  });

  it('displays the level text correctly', () => {
    render(<LogLevelBadge level="ERROR" />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });
});
