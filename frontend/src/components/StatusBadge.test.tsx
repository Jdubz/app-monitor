import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/test-utils';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders running status correctly', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-emerald-500/20', 'text-emerald-200');
    expect(badge).not.toHaveClass('animate-pulse');
  });

  it('renders stopped status correctly', () => {
    render(<StatusBadge status="stopped" />);
    const badge = screen.getByText('○ Stopped');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-destructive/20');
    expect(badge).not.toHaveClass('animate-pulse');
  });

  it('renders starting status correctly', () => {
    render(<StatusBadge status="starting" />);
    const badge = screen.getByText('◐ Starting...');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-amber-400/20', 'animate-pulse');
  });

  it('renders stopping status correctly', () => {
    render(<StatusBadge status="stopping" />);
    const badge = screen.getByText('◑ Stopping...');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-amber-400/20', 'animate-pulse');
  });

  it('renders error status correctly', () => {
    render(<StatusBadge status="error" />);
    const badge = screen.getByText('✕ Error');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-destructive/20');
  });

  it('has animation for transitional states (starting)', () => {
    render(<StatusBadge status="starting" />);
    const badge = screen.getByText('◐ Starting...');
    expect(badge).toHaveClass('animate-pulse');
  });

  it('has animation for transitional states (stopping)', () => {
    render(<StatusBadge status="stopping" />);
    const badge = screen.getByText('◑ Stopping...');
    expect(badge).toHaveClass('animate-pulse');
  });

  it('does not have animation for stable states', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).not.toHaveClass('animate-pulse');
  });

  it('renders with proper styling structure', () => {
    render(<StatusBadge status="running" />);
    const badge = screen.getByText('● Running');
    expect(badge).toHaveClass('inline-flex', 'font-mono', 'tracking-[0.3em]');
  });
});
