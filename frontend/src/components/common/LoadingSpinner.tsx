import { CSSProperties } from 'react';
import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ 
  size = 'medium', 
  message,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const spinner = (
    <div className={`${styles.spinner} ${styles[size]}`}>
      <div className={styles.spinnerCircle}></div>
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={styles.fullScreen}>
        {spinner}
      </div>
    );
  }

  return spinner;
}

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function LoadingSkeleton({ 
  width = '100%', 
  height = '20px',
  borderRadius = '4px',
  className = ''
}: LoadingSkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    borderRadius,
  };

  return (
    <div 
      className={`${styles.skeleton} ${className}`}
      style={style}
    />
  );
}

export function LoadingCard() {
  return (
    <div className={styles.cardSkeleton}>
      <LoadingSkeleton height="24px" width="60%" />
      <LoadingSkeleton height="16px" width="80%" />
      <LoadingSkeleton height="16px" width="70%" />
      <div className={styles.skeletonActions}>
        <LoadingSkeleton height="32px" width="80px" />
        <LoadingSkeleton height="32px" width="80px" />
      </div>
    </div>
  );
}
