import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import useAuth from '../../Auth/useAuth';
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { MachineUsage } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import { OmniAPI } from "src/apis/OmniAPI";
import { AuthAPI } from "src/apis/AuthAPI";
import PageRuler from '../../shared/PageRuler';
import rulerMask from '../../../assets/img/ruler-mask-tile.svg?url';
import '../styles/Summary.scss';
import '../styles/Dashboard.scss';

const LOGS_PER_PAGE = 5;
const SEMESTER_NAMES = ['Fall', 'Spring', 'Summer'];

const money = (value: number | string | undefined | null) => `$${Number(value ?? 0).toFixed(2)}`;

const semesterLabel = (raw: string | null | undefined): string => {
    if (!raw) return 'No semester';
    const year = raw.match(/\d{4}/)?.[0] ?? '';
    const lower = raw.toLowerCase();
    const name = SEMESTER_NAMES.find((n) => lower.includes(n.toLowerCase()))
        ?? SEMESTER_NAMES[Number(raw.match(/^\s*(\d)\b/)?.[1] ?? -1)]
        ?? raw;
    return year ? `${name} ${year}` : name;
};

const semesterFromDate = (date: Date): string => {
    const month = date.getMonth();
    const name = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
    return `${name} ${date.getFullYear()}`;
};

const shortDate = (value: string | Date) =>
    new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });

const clockTime = (value: Date) =>
    value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '');

const elapsed = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const Summary: React.FC = () => {

    const { user, setUser, hasPermission } = useAuth();
    const location = useLocation();

    const [currentUsage, setCurrentUsage] = React.useState<MachineUsage | null>(null);
    const [currentUsageCount, setCount] = useState<number>(0)
    const [machineUsages, setMachineUsages] = React.useState<MachineUsage[]>([]);
    
    const [showGraduationPrompt, setShowGraduationPrompt] = useState(false);
    const graduationPromptHandled = useRef(false);
    const [showEmailVerificationPrompt, setShowEmailVerificationPrompt] = useState(false);

    const [currentSemester, setCurrentSemester] = useState<string>(() => semesterFromDate(new Date()));
    const [semesterFilter, setSemesterFilter] = useState<string>('');
    const [page, setPage] = useState(1);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (graduationPromptHandled.current) return;
        if (!user?.id) return;

        const checkGraduationAndVerification = async () => {
            const currentSemester = await OmniAPI.get("semesters", "current").catch(() => null);

            console.log("Current Semester:", currentSemester);
            console.log("User Checked Graduating:", user.checked_graduating, !user.checked_graduating);

            if (currentSemester && (!user.checked_graduating || user.checked_graduating !== currentSemester.id)) {
                setShowGraduationPrompt(true);
            } else if (!user.is_email_verified) {
                if (!location.state?.justLoggedIn) return;
                setShowEmailVerificationPrompt(true);
            }
        };
        checkGraduationAndVerification();
        graduationPromptHandled.current = true;
    }, [user.id, user.checked_graduating, user.is_email_verified]);

    const saveGraduationDetails = async (isGraduating: boolean) => {
        setShowGraduationPrompt(false);
        try {
            const data = await OmniAPI.edit("users", "graduation", {
                is_graduating: isGraduating,
            });

            setUser(data);
            localStorage.setItem("user", JSON.stringify(data));
            if (!data.is_email_verified) {
                setShowEmailVerificationPrompt(true);
            }
        } catch (error) {
            console.error("Error saving graduation details:", error);
        }
    };

    const resendVerificationEmail = () => {
        setShowEmailVerificationPrompt(false);
        void AuthAPI.makeVerifyToken({ token_type: "email_verification" })
            .catch((error) => console.error("Error sending verification email:", error));
        alert('A verification email has been sent to your RPI email (It may be in spam). Please open the email, click the link, and verify your email');
    };

    useEffect(() => {
        const getUsages = async () => {
            try {
                const data: MachineUsage[] = await OmniAPI.getEvery("usages/me", { order_by: "time_started", descending: true });
                setMachineUsages(data);
            } catch (error) {
                console.error("Error fetching machine usages:", error);
            }
        };

        const getCurrentUsage = async () => {
            try {
                const data: MachineUsage[] = await OmniAPI.get("usages/current", "me");
                setCurrentUsage(data[0] ?? null);
                setCount(data.length);
            } catch (error) {
                console.error("Error fetching current machine usages:", error);
            }
        };

        const getCurrentSemester = async () => {
            const semester = await OmniAPI.get("semesters", "current").catch(() => null);
            if (semester?.calendar_year !== undefined) {
                setCurrentSemester(semesterLabel(`${semester.semester_type} ${semester.calendar_year}`));
            }
        };

        // The user saved at login goes stale (e.g. semester_balance after a new usage),
        // so refresh it whenever the summary is opened.
        const refreshUser = async () => {
            try {
                const response = await AuthAPI.me();
                if (response.status === 200 && response.data) {
                    setUser(response.data);
                    localStorage.setItem("user", JSON.stringify(response.data));
                }
            } catch (error) {
                console.error("Error refreshing user data:", error);
            }
        };

        getUsages();
        getCurrentUsage();
        getCurrentSemester();
        refreshUser();
    }, []);

    useEffect(() => {
        if (!currentUsage) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [currentUsage]);

    const semesters = React.useMemo(() => {
        const labels = new Set<string>();
        machineUsages.forEach((usage) => labels.add(semesterLabel(usage.semester)));
        labels.add(currentSemester);
        return Array.from(labels);
    }, [machineUsages, currentSemester]);

    const activeFilter = semesterFilter || currentSemester;

    const filteredUsages = React.useMemo(
        () => activeFilter === 'all'
            ? machineUsages
            : machineUsages.filter((usage) => semesterLabel(usage.semester) === activeFilter),
        [machineUsages, activeFilter],
    );

    const pageCount = Math.max(1, Math.ceil(filteredUsages.length / LOGS_PER_PAGE));
    const safePage = Math.min(page, pageCount);
    const pageRows = filteredUsages.slice((safePage - 1) * LOGS_PER_PAGE, safePage * LOGS_PER_PAGE);

    const spending = React.useMemo(() => {
        const totals = new Map<string, number>();
        machineUsages
            .filter((usage) => semesterLabel(usage.semester) === currentSemester)
            .forEach((usage) => totals.set(usage.machine_name, (totals.get(usage.machine_name) ?? 0) + Number(usage.cost)));
        const rows = Array.from(totals, ([machine, cost]) => ({ machine, cost })).sort((a, b) => b.cost - a.cost);
        const max = Math.max(...rows.map((row) => row.cost), 0);
        return rows.map((row) => ({ ...row, share: max > 0 ? row.cost / max : 0 }));
    }, [machineUsages, currentSemester]);

    const canUseMachines = hasPermission(UserPermission.CAN_USE_MACHINES) || hasPermission(UserPermission.CAN_USE_MACHINES_BETWEEN_SEMESTERS);

    const sessionStart = currentUsage ? new Date(currentUsage.time_started) : null;
    const sessionEnd = sessionStart && currentUsage
        ? new Date(sessionStart.getTime() + Number(currentUsage.duration) * 1000)
        : null;

    return (
        <div className='dash'>
            <Dialog.Root open={showGraduationPrompt} onOpenChange={setShowGraduationPrompt}>
                <Dialog.Portal>
                    <Dialog.Overlay className="AlertDialogOverlay" />
                    <Dialog.Content className="AlertDialogContent" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                        <Dialog.Title className="AlertDialogTitle">
                            Are you graduating this semester?
                        </Dialog.Title>
                        <div className="mf-graduation-dialog-actions">
                            <button className="Button" onClick={() => saveGraduationDetails(true)}>
                                Yes
                            </button>
                            <button className="Button" onClick={() => saveGraduationDetails(false)}>
                                No
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
            <Dialog.Root open={showEmailVerificationPrompt} onOpenChange={setShowEmailVerificationPrompt}>
                <Dialog.Portal>
                    <Dialog.Overlay className="AlertDialogOverlay" />
                    <Dialog.Content className="AlertDialogContent" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                        <Dialog.Title className="AlertDialogTitle">
                            Your email is not verified
                        </Dialog.Title>
                        <p>If you have just created your account, please click the link sent to your email to verify your account. Click resend if the link expired to send a new email.</p>
                        <div className="mf-graduation-dialog-actions">
                            <button className="Button" onClick={resendVerificationEmail}>
                                Resend
                            </button>
                            <button className="Button" onClick={() => setShowEmailVerificationPrompt(false)}>
                                Close
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            <section className='dash-section dash-section--info'>
                <PageRuler src={rulerMask} color='var(--color-navy)' width={79} zIndex={2} />
                <div className='dash-inner'>
                    <header className='dash-header'>
                        <div>
                            <h1 className='dash-title'>My Dashboard</h1>
                            <p className='dash-welcome'>Welcome back{user.first_name ? `, ${user.first_name}` : ''}!</p>
                        </div>
                        {canUseMachines && (
                            <Link className='dash-use-btn' to='/myforge/create'>+ Use a Machine</Link>
                        )}
                    </header>

                    <div className='dash-cards'>
                        <div className='dash-card dash-card--cost'>
                            <p className='dash-eyebrow'>SEMESTER COST</p>
                            <p className='dash-amount'>{money(user.semester_balance)}</p>
                            <p className='dash-caption'>Total spent this semester</p>
                        </div>

                        <div className='dash-card dash-card--session'>
                            <div className='dash-session-top'>
                                <p className='dash-eyebrow'>CURRENT SESSION</p>
                                {currentUsage && <span className='dash-live'>Live</span>}
                                {currentUsageCount > 1 && <span className='dash-more'>+{currentUsageCount - 1} more</span>}
                            </div>
                            {currentUsage && sessionStart ? (
                                <>
                                    <div className='dash-session-machine'>
                                        <div className='dash-session-name'>
                                            <span className='dash-dot' aria-hidden='true' />
                                            <div>
                                                <p className='dash-machine'>{currentUsage.machine_name}</p>
                                                {sessionEnd && <p className='dash-muted'>Ends at {clockTime(sessionEnd)}</p>}
                                            </div>
                                        </div>
                                        <p className='dash-muted dash-started'>Started at {clockTime(sessionStart)}</p>
                                    </div>
                                    <div className='dash-session-stats'>
                                        <div>
                                            <p className='dash-muted'>Elapsed Time</p>
                                            <p className='dash-stat'>{elapsed((now - sessionStart.getTime()) / 1000)}</p>
                                        </div>
                                        <div>
                                            <p className='dash-muted'>Session Cost</p>
                                            <p className='dash-stat'>{money(currentUsage.cost)}</p>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <p className='dash-empty'>You’re not using a machine right now.</p>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className='dash-section dash-section--machines'>
                <PageRuler src={rulerMask} color='var(--color-red)' width={79} zIndex={2} />
                <div className='dash-inner'>
                    <div className='dash-row-head'>
                        <h2 className='dash-subtitle'>Your Spending by Machine</h2>
                        <p className='dash-period'>This Semester</p>
                    </div>
                    <div className='dash-panel dash-spending'>
                        {spending.length === 0 ? (
                            <p className='dash-empty'>No machine usage in {currentSemester} yet.</p>
                        ) : spending.map((row) => (
                            <div className='dash-bar-row' key={row.machine}>
                                <span className='dash-bar-label'>{row.machine}</span>
                                <span className='dash-bar-track'>
                                    <span className='dash-bar-fill' style={{ width: `${Math.max(row.share * 100, 2)}%` }} />
                                </span>
                                <span className='dash-bar-value'>{money(row.cost)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className='dash-section dash-section--activity'>
                <PageRuler src={rulerMask} color='var(--color-navy-mid)' width={79} zIndex={2} />
                <div className='dash-inner'>
                    <div className='dash-panel dash-activity'>
                        <div className='dash-activity-head'>
                            <h2 className='dash-activity-title'>Recent Activity</h2>
                            <label className='dash-filter'>
                                <span>Filter:</span>
                                <select
                                    value={activeFilter}
                                    onChange={(e) => { setSemesterFilter(e.target.value); setPage(1); }}
                                >
                                    {semesters.map((label) => (
                                        <option key={label} value={label}>{label}</option>
                                    ))}
                                    <option value='all'>All semesters</option>
                                </select>
                            </label>
                        </div>
                        <div className='dash-table-wrap'>
                            <table className='dash-table'>
                                <thead>
                                    <tr>
                                        <th>SEMESTER</th>
                                        <th>DATE</th>
                                        <th>MACHINE</th>
                                        <th>COST</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className='dash-table-empty'>No machine logs for this semester.</td>
                                        </tr>
                                    ) : pageRows.map((usage) => (
                                        <tr key={`${usage.time_started}-${usage.machine_name}`}>
                                            <td>{semesterLabel(usage.semester)}</td>
                                            <td>{shortDate(usage.time_started)}</td>
                                            <td className='dash-table-machine'>{usage.machine_name}</td>
                                            <td>{money(usage.cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className='dash-activity-foot'>
                            <p>Displaying {pageRows.length} of {filteredUsages.length} machine logs</p>
                            <div className='dash-pager'>
                                <button type='button' aria-label='Previous page' disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>&lt;</button>
                                <button type='button' aria-label='Next page' disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>&gt;</button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Summary;
