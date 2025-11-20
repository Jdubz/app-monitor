import { useState } from 'react';
import { PlayCircle } from 'lucide-react';

import { useDevBotsStore } from '@/contexts/devBotsStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ResumeTaskButtonProps {
  taskId: string;
  onResumeSuccess?: () => void;
}

export function ResumeTaskButton({ taskId, onResumeSuccess }: ResumeTaskButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [resumedBy, setResumedBy] = useState('');
  const [validationError, setValidationError] = useState<string>();
  const { resumeTask, isResuming, resumeError } = useDevBotsStore();

  const handleResume = async () => {
    if (!resumedBy.trim()) {
      setValidationError('Please enter your name');
      return;
    }

    setValidationError(undefined);

    try {
      await resumeTask(taskId, resumedBy);
      setIsOpen(false);
      setResumedBy('');
      onResumeSuccess?.();
    } catch (error) {
      // Error handled by store and displayed below
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        <PlayCircle className="mr-2 h-4 w-4" />
        Resume Task
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume Blocked Task</DialogTitle>
            <DialogDescription>
              This task is currently blocked. Resuming will clear the blocking state and allow the
              task to be retried.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="resumedBy">Your Name</Label>
              <Input
                id="resumedBy"
                value={resumedBy}
                onChange={(e) => setResumedBy(e.target.value)}
                placeholder="e.g., john.doe"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be recorded in the audit trail
              </p>
            </div>

            {(validationError || resumeError) && (
              <p className="text-xs text-destructive">{validationError || resumeError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isResuming}>
              Cancel
            </Button>
            <Button onClick={handleResume} disabled={isResuming || !resumedBy.trim()}>
              {isResuming ? 'Resuming...' : 'Resume Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
