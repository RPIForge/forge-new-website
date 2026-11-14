import React, { FormEvent, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Cross2Icon } from '@radix-ui/react-icons';
import dividerLine from '../../assets/img/auth-divider.svg?url';

import './AdminForm.scss';

interface AdminFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    submitLabel?: string;
    onSubmit: () => void | Promise<void>;
    busy?: boolean;
    error?: string;
    submitDisabled?: boolean;
    trigger?: ReactNode;
    children: ReactNode;
}

// The card used by every add/edit form on the Admin page
export const AdminFormDialog: React.FC<AdminFormDialogProps> = ({
    open,
    onOpenChange,
    title,
    submitLabel = 'Save',
    onSubmit,
    busy = false,
    error,
    submitDisabled = false,
    trigger,
    children,
}) => {
    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!busy) void onSubmit();
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            {trigger}
            <Dialog.Portal>
                <Dialog.Overlay className="admin-form-overlay" />
                <Dialog.Content className="admin-form" aria-describedby={undefined}>
                    <Dialog.Close asChild>
                        <button type="button" className="admin-form__close" aria-label="Close"><Cross2Icon /></button>
                    </Dialog.Close>
                    <form onSubmit={handleSubmit}>
                        <Dialog.Title className="admin-form__title">{title}</Dialog.Title>
                        <img className="admin-form__divider" src={dividerLine} alt="" aria-hidden="true" />
                        <div className="admin-form__body">{children}</div>
                        {error && <p className="admin-form__error" role="alert">{error}</p>}
                        <div className="admin-form__actions">
                            <button type="submit" className="admin-form__submit" disabled={busy || submitDisabled}>
                                {busy ? 'Saving…' : submitLabel}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

// A right-aligned "Label [ input ]" row
export const AdminField: React.FC<{ label: string; htmlFor: string; children: ReactNode }> = ({ label, htmlFor, children }) => (
    <div className="admin-form__field">
        <label htmlFor={htmlFor}>{label}</label>
        {children}
    </div>
);

export const AdminFormHeading: React.FC<{ children: ReactNode }> = ({ children }) => (
    <p className="admin-form__heading">{children}</p>
);

interface AdminCheckProps {
    id: string;
    label: ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export const AdminCheck: React.FC<AdminCheckProps> = ({ id, label, checked, onChange }) => (
    <div className="admin-form__check">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
    </div>
);

// Scrolls on its own when there are a lot of options, so the card stays on screen
export const AdminCheckList: React.FC<{ children: ReactNode; empty?: string }> = ({ children, empty }) => {
    const hasItems = React.Children.count(children) > 0;
    return (
        <div className="admin-form__checklist">
            {hasItems ? children : <p className="admin-form__empty">{empty ?? 'Nothing to choose from yet.'}</p>}
        </div>
    );
};

export const errorMessage = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail ?? err?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return fallback;
};
