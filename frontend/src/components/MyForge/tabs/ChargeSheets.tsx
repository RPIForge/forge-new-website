import React, { useState, useEffect } from 'react';
import { AdminField, AdminFormDialog, errorMessage } from '../../Admin/AdminForm';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import Table, { ITEMS_PER_PAGE, TableHead, ColumnDef, formatCell, usePagedList } from '../components/Table';
import useAuth from '../../Auth/useAuth';

import { UserCharge, Semester } from 'src/interfaces';
import { SEMESTER_TYPE_MAP } from './Semesters';

type ChargeSheetCsvRow = {
    rin: string;
    firstName: string;
    lastName: string;
    membershipCharge: string;
    usagesCharge: string;
    totalCharge: string;
};

const ChargeSheets: React.FC = () => {
    const { hasPermission } = useAuth();
    const canGetCharges = hasPermission(UserPermission.CAN_GET_CHARGES);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const { data, currentPage, hasNext, loading, error, fetchPage } = usePagedList<UserCharge>('users', {
        enabled: canSeeTables && canGetCharges,
    });
    const columnDefs: ColumnDef<UserCharge>[] = [
        { key: 'name', label: 'Name', render: (u) => `${u.first_name} ${u.last_name}` },
        { key: 'rin', label: 'RIN', render: (u) => u.RIN },
        { key: 'balance', label: 'Usage Charges', render: (u) => `$${Number(u.semester_balance ?? 0).toFixed(2)}` },
        { key: 'graduating', label: 'Graduating', render: (u) => formatCell(Boolean(u.is_graduating)) },
    ];

    const [semesterId, setSemesterId] = useState<string | null>(null);
    const [semesters, setSemesters] = useState<Semester[]>([]);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [membershipCharge, setMembershipCharge] = useState<number | ''>('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        Promise.all([
            OmniAPI.getEvery('semesters'),
            OmniAPI.get('semesters', 'current'),
        ]).then(([all, current]) => {
            setSemesters(Array.isArray(all) ? all : []);
            setSemesterId(current?.id ?? null);
        }).catch(() => setSemesters([]));
    }, []);

    const handleSemesterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSemesterId(e.target.value);
    };

    // CSV CREATION
    function getSemesterName(semester: Semester | undefined | null): string {
        if (!semester) return 'Semester';
        let semTypeStr = '';
        if (typeof semester.semester_type === 'number') {
            semTypeStr = SEMESTER_TYPE_MAP[semester.semester_type] ?? String(semester.semester_type);
        } else {
            semTypeStr = SEMESTER_TYPE_MAP[Number(semester.semester_type)] ?? String(semester.semester_type);
        }
        return `${semTypeStr}_${semester.calendar_year}`;
    }

    function getRowsByGraduating(charges: UserCharge[], membership: number, isGraduating: boolean): ChargeSheetCsvRow[] {
        return charges.filter((row) => Boolean(row.is_graduating) === isGraduating).map((row) => {
            const usages = Number(row.semester_balance ?? 0);
            const total = membership + usages;
            return {
                rin: row.RIN,
                firstName: row.first_name,
                lastName: row.last_name,
                membershipCharge: membership.toFixed(2),
                usagesCharge: usages.toFixed(2),
                totalCharge: total.toFixed(2)
            };
        });
    }

    function downloadCSV(rows: ChargeSheetCsvRow[], semesterName: string, graduatingornot: string) {
        const csvHeader = ['RIN', 'First Name', 'Last Name', 'Membership Charge', 'Usages Charge', 'Total Charge'];
        const escapeCSV = (field: any) => {
            const str = String(field ?? '');
            if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };
        const csvRows = rows.map((row) => [
            row.rin,
            row.firstName,
            row.lastName,
            row.membershipCharge,
            row.usagesCharge,
            row.totalCharge
        ]);
        const csvContent = [csvHeader, ...csvRows]
            .map(r => r.map(escapeCSV).join(','))
            .join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${semesterName}_Forge_Charges_${graduatingornot}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const handleCreateChargeSheet = async () => {
        if (!semesterId || membershipCharge === '' || isNaN(Number(membershipCharge))) {
            setFormError('Please select a semester and enter a valid membership charge.');
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            const chargesResponse = await OmniAPI.exec('get_charges', { semester_id: semesterId });
            const charges: UserCharge[] = Array.isArray(chargesResponse) ? chargesResponse : [];
            const membership = Number(membershipCharge);

            const graduatingRows = getRowsByGraduating(charges, membership, true);
            const nongraduatingRows = getRowsByGraduating(charges, membership, false);

            const selectedSemester = semesters.find(s => String(s.id) === String(semesterId));
            const semesterName = getSemesterName(selectedSemester);

            if (graduatingRows.length > 0) downloadCSV(graduatingRows, semesterName, 'graduating');
            if (nongraduatingRows.length > 0) downloadCSV(nongraduatingRows, semesterName, 'nongraduating');
            setDialogOpen(false);
        } catch (err) {
            setFormError(errorMessage(err, 'Failed to create charge sheet.'));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || !canGetCharges) return null;
    return (
        <div className='tab-column-cover align-center'>
            <TableHead heading="Charge Sheets" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%',  padding: 30}}>
                <AdminFormDialog
                    open={dialogOpen}
                    onOpenChange={(open) => { setFormError(''); setDialogOpen(open); }}
                    title="Create Charge Sheet"
                    submitLabel="Download"
                    onSubmit={handleCreateChargeSheet}
                    busy={busy}
                    error={formError}
                    trigger={
                        <button type="button" className="Button OfficerBtn" onClick={() => setDialogOpen(true)}>
                            Create Charge Sheet
                        </button>
                    }
                >
                    <AdminField label="Select a Semester" htmlFor="semester-select">
                        <select id="semester-select" value={semesterId ?? ''} onChange={handleSemesterChange} disabled={semesters.length === 0} required>
                            <option value="" disabled>Select a semester</option>
                            {semesters.map((sem) => (
                                <option key={sem.id} value={sem.id}>
                                    {getSemesterName(sem).replace('_', ' ')}
                                </option>
                            ))}
                        </select>
                    </AdminField>
                    <AdminField label="Membership Charge" htmlFor="membership-charge-input">
                        <input
                            id="membership-charge-input"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={membershipCharge}
                            onChange={e => setMembershipCharge(e.target.value === '' ? '' : Number(e.target.value))}
                            required
                        />
                    </AdminField>
                </AdminFormDialog>
            </div>

            <div style={{ color: 'red',  paddingLeft: 32, paddingRight: 32}}>
                Warning: The data below is a visual of the current semester. Export the csv for the charge sheet.
            </div>
            <Table<UserCharge>
                columnDefs={columnDefs}
                loading={loading}
                error={error}
                hasNext={hasNext}
                data={data}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="users"
            />
        </div>
    );
};

export default ChargeSheets;
