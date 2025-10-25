import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/test-utils';
import StatusBadge from './StatusBadge';
import { ProcessInfo } from '../types/service.types';

describe('StatusBadge', () => {
  it('renders running status correctly', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('● Running')).toBeInTheDocument();
  });

  it('renders stopped status correctly', () => {
    render(<StatusBadge status="stopped" />);
    expect(screen.getByText('○ Stopped')).toBeInTheDocument();
  });

  it('renders starting status correctly', () => {
    render(<StatusBadge status="starting" />);
    expect(screen.getByText('◐ Starting...')).toBeInTheDocument();
  });

  it('renders stopping status correctly', () => {
    render(<StatusBadge status="stopping" />);
    expect(screen.getByText('◑ Stopping...')).toBeInTheDocument();
  });

  it('renders error status correctly', () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText('✕ Error')).toBeInTheDocument();
  });

  it('applies correct colors for running status', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).toHaveStyle({
      backgroundColor: '#d4edda',
      color: '#155724',
    });
  });

  it('applies correct colors for stopped status', () => {
    render(<StatusBadge status="stopped" />);
    const badge = screen.getByText('○ Stopped');
    expect(badge).toHaveStyle({
      backgroundColor: '#f8d7da',
      color: '#721c24',
    });
  });

  it('applies correct colors for starting status', () => {
    render(<StatusBadge status="starting" />);
    const badge = screen.getByText('◐ Starting...');
    expect(badge).toHaveStyle({
      backgroundColor: '#fff3cd',
      color: '#856404',
    });
  });

  it('applies correct colors for stopping status', () => {
    render(<StatusBadge status="stopping" />);
    const badge = screen.getByText('◑ Stopping...');
    expect(badge).toHaveStyle({
      backgroundColor: '#fff3cd',
      color: '#856404',
    });
  });

  it('applies correct colors for error status', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('✕ Error');
    expect(badge).toHaveStyle({
      backgroundColor: '#f8d7da',
      color: '#721c24',
    });
  });

  it('has animation for transitional states (starting)', () => {
    render(<StatusBadge status="starting" />);
    const badge = screen.getByText('◐ Starting...');
    // Check that animation is applied
    const computedStyle = window.getComputedStyle(badge);
    expect(computedStyle.animation).not.toBe('none');
  });

  it('has animation for transitional states (stopping)', () => {
    render(<StatusBadge status="stopping" />);
    const badge = screen.getByText('◑ Stopping...');
    const computedStyle = window.getComputedStyle(badge);
    expect(computedStyle.animation).not.toBe('none');
  });

  it('does not have animation for stable states', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).toHaveStyle({ animation: 'none' });
  });

  it('renders with proper styling structure', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).toHaveStyle({
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '12px',
      fontSize: '13px',
      fontWeight: '600',
    });
  });
});
