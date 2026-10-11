// 二次确认弹窗：button 类动作等不可逆操作专用（PRD 坑点 7 / R9）。
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
