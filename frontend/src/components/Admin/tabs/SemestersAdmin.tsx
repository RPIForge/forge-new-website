import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminField, AdminFormDialog } from '../AdminForm';
import { OmniAPI } from 'src/apis/OmniAPI';
import { Semester } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';
import editIcon from '../../../assets/img/icon-edit.svg?url';
import deleteIcon from '../../../assets/img/icon-delete.svg?url';

const SEASONS = ['Fall', 'Spring', 'Summer'];

const seasonIndex = (value: Semester['semester_type']): number => {
    if (typeof value === 'number') return value;
    const found = SEASONS.findIndex((s) => String(value).toLowerCase().includes(s.toLowerCase()));
    return found >= 0 ? found : Number(value) || 0;
};

const semesterName = (s: Semester | null) =>
    s ? `${SEASONS[seasonIndex(s.semester_type)] ?? s.semester_type} ${s.calendar_year}` : 'None set';

const errorText = (err: any, fallback: string) => err?.response?.data?.detail
    ? `${fallback}: ${typeof err.response.data.detail === 'string' ? err.response.data.detail : 'invalid data'}`
    : fallback;

type DialogKind = 'add' | 'edit' | 'advance' | 'set' | null;

const SemestersAdmin: React.FC = () => {
    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_SEMESTERS);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_SEMESTERS);
    const canDelete = hasPermission(UserPermission.CAN_DELETE_SEMESTERS);
    const canChange = hasPermission(UserPermission.CAN_CHANGE_SEMESTER);

    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [current, setCurrent] = useState<Semester | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [dialog, setDialog] = useState<DialogKind>(null);
    const [editing, setEditing] = useState<Semester | null>(null);
    const [season, setSeason] = useState(0);
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [targetId, setTargetId] = useState('');
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const list: Semester[] = await OmniAPI.getEvery('semesters');
            setSemesters(list);
        } catch {
            setLoadError('Unable to load semesters. Please try again.');
        } finally {
            setLoading(false);
        }
        const active = await OmniAPI.get('semesters', 'current').catch(() => null);
        setCurrent(active);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const sorted = useMemo(() => {
        const order = (s: Semester) => s.calendar_year * 3 + [2, 0, 1][seasonIndex(s.semester_type)];
        return [...semesters].sort((a, b) => order(b) - order(a));
    }, [semesters]);

    const close = () => {
        setDialog(null);
        setEditing(null);
        setFormError('');
        setBusy(false);
    };

    const openAdd = () => {
        setEditing(null);
        setSeason(0);
        setYear(String(new Date().getFullYear()));
        setFormError('');
        setDialog('add');
    };

    const openEdit = (s: Semester) => {
        setEditing(s);
        setSeason(seasonIndex(s.semester_type));
        setYear(String(s.calendar_year));
        setFormError('');
        setDialog('edit');
    };

    const openSet = () => {
        setTargetId(current?.id ?? '');
        setFormError('');
        setDialog('set');
    };

    const run = async (action: () => Promise<unknown>, failMessage: string) => {
        setBusy(true);
        setFormError('');
        try {
            await action();
            close();
            load();
        } catch (err) {
            setFormError(errorText(err, failMessage));
            setBusy(false);
        }
    };

    const save = () => {
        const calendarYear = Number(year);
        if (!Number.isInteger(calendarYear) || calendarYear < 2020 || calendarYear > 9999) {
            setFormError('Calendar year must be between 2020 and 9999.');
            return;
        }
        const body = { semester_type: season, calendar_year: calendarYear };
        if (dialog === 'edit' && editing) {
            run(() => OmniAPI.edit('semesters', editing.id, body), 'Could not save the semester');
        } else {
            run(() => OmniAPI.create('semesters', body), 'Could not create the semester');
        }
    };

    const remove = (s: Semester) => {
        if (!window.confirm(`Delete ${semesterName(s)}? This cannot be undone.`)) return;
        OmniAPI.delete('semesters', s.id)
            .then(load)
            .catch((err) => alert(errorText(err, 'Could not delete the semester')));
    };

    const isCurrent = (s: Semester) => current?.id === s.id;

    return (
        <div className="tab-column-cover admin-semesters">
            <div className="table-head">
                <h2>Semesters</h2>
                <div className="admin-semesters__actions">
                    {canChange && (
                        <>
                            <button type="button" className="admin-btn admin-btn--outline" onClick={openSet}>Set Current</button>
                            <button type="button" className="admin-btn" onClick={() => { setFormError(''); setDialog('advance'); }}>Advance Semester</button>
                        </>
                    )}
                    {canCreate && (
                        <button type="button" className="addbtn" aria-label="Add semester" onClick={openAdd} />
                    )}
                </div>
            </div>

            <div className="admin-semesters__current">
                <p className="admin-semesters__eyebrow">CURRENT SEMESTER</p>
                <p className="admin-semesters__name">{semesterName(current)}</p>
                <p className="admin-semesters__note">Machine usages are charged to this semester.</p>
            </div>

            {loading ? (
                <p className="admin-semesters__status">Loading semesters…</p>
            ) : loadError ? (
                <p className="admin-semesters__status admin-semesters__status--error">{loadError}</p>
            ) : sorted.length === 0 ? (
                <p className="admin-semesters__status">No semesters yet. Use + to add one.</p>
            ) : (
                <div className="table-container">
                    <table className="has-actions">
                        <thead>
                            <tr>
                                <th>Season</th>
                                <th>Year</th>
                                <th>Status</th>
                                {(canEdit || canDelete) && <th id="edit-col" aria-label="Actions" />}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((s) => (
                                <tr key={s.id} className={isCurrent(s) ? 'is-current' : undefined}>
                                    <td>{SEASONS[seasonIndex(s.semester_type)] ?? String(s.semester_type)}</td>
                                    <td>{s.calendar_year}</td>
                                    <td>{isCurrent(s) ? <span className="admin-badge">Current</span> : <span className="admin-muted">—</span>}</td>
                                    {(canEdit || canDelete) && (
                                        <td className="icon">
                                            {canEdit && (
                                                <button type="button" className="edit" aria-label={`Edit ${semesterName(s)}`} onClick={() => openEdit(s)}>
                                                    <img src={editIcon} alt="" />
                                                </button>
                                            )}
                                            {canDelete && !isCurrent(s) && (
                                                <button type="button" className="trash" aria-label={`Delete ${semesterName(s)}`} onClick={() => remove(s)}>
                                                    <img src={deleteIcon} alt="" />
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <AdminFormDialog
                open={dialog === 'add' || dialog === 'edit'}
                onOpenChange={(open) => { if (!open) close(); }}
                title={dialog === 'edit' ? 'Editing a Semester' : 'Adding a Semester'}
                onSubmit={save}
                busy={busy}
                error={formError}
            >
                <AdminField label="Season" htmlFor="semester-season">
                    <select id="semester-season" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
                        {SEASONS.map((label, index) => <option key={label} value={index}>{label}</option>)}
                    </select>
                </AdminField>
                <AdminField label="Calendar Year" htmlFor="semester-year">
                    <input id="semester-year" type="number" inputMode="numeric" min={2020} max={9999} value={year} onChange={(e) => setYear(e.target.value)} required />
                </AdminField>
            </AdminFormDialog>

            <AdminFormDialog
                open={dialog === 'advance'}
                onOpenChange={(open) => { if (!open) close(); }}
                title="Advance Semester?"
                submitLabel="Advance"
                onSubmit={() => run(() => OmniAPI.exec('next_semester'), 'Could not advance the semester')}
                busy={busy}
                error={formError}
            >
                <p className="admin-form__text">
                    This moves the site from <strong>{semesterName(current)}</strong> to the next semester. New machine usages will be charged to the new semester. This can’t be undone.
                </p>
            </AdminFormDialog>

            <AdminFormDialog
                open={dialog === 'set'}
                onOpenChange={(open) => { if (!open) close(); }}
                title="Set Active Semester"
                onSubmit={() => run(() => OmniAPI.exec('set_semester', { semester_id: targetId }), 'Could not set the semester')}
                busy={busy}
                error={formError}
                submitDisabled={!targetId}
            >
                <AdminField label="Select A Semester" htmlFor="semester-target">
                    <select id="semester-target" value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
                        <option value="" disabled>Select a semester</option>
                        {sorted.map((sem) => <option key={sem.id} value={sem.id}>{semesterName(sem)}</option>)}
                    </select>
                </AdminField>
            </AdminFormDialog>
        </div>
    );
};

export default SemestersAdmin;
