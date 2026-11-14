import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import '../styles/Table.scss';
import { ArrowLeftIcon, ArrowRightIcon } from '@radix-ui/react-icons';
import editIcon from '../../../assets/img/icon-edit.svg?url';
import deleteIcon from '../../../assets/img/icon-delete.svg?url';
import { OmniAPI } from 'src/apis/OmniAPI';

export interface ColumnDef<T> {
    key: string;
    label: string;
    render: (row: T) => ReactNode;
    // Plain text used for the hover tooltip
    text?: (row: T) => string;
}

interface TableProps<T> {
    columns?: (keyof T)[];
    // Use instead of columns to show combined / formatted cells
    columnDefs?: ColumnDef<T>[];
    data: T[];
    loading?: boolean;
    error?: string;
    // When the parent already knows if there is another page, skip the extra request
    hasNext?: boolean;
    emptyMessage?: string;
    // Smaller headers, and switches to stacked rows sooner, for tables with many columns
    compact?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    onEdit?: (activeItem: T) => void;
    onDelete?: (index_local: number, index_real:number) => void;
    currentPage?: number;
    onPageChange?: (page: number) => void;
    resourceType?: string;
}

export const ITEMS_PER_PAGE = 10;

export const formatCell = (value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    return String(value);
};

interface PagedListOptions<T> {
    params?: Record<string, any>;
    // Reshape each page after it loads (e.g. to add names looked up elsewhere)
    transform?: (rows: any[]) => Promise<T[]> | T[];
    enabled?: boolean;
}

// Loads one page at a time, asking for one extra row to know if there's a next page
export function usePagedList<T>(type: string, options: PagedListOptions<T> = {}) {
    const { params, transform, enabled = true } = options;
    const [data, setData] = useState<T[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [hasNext, setHasNext] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const requestId = useRef(0);
    const optionsRef = useRef({ params, transform });
    optionsRef.current = { params, transform };

    const fetchPage = useCallback(async (page: number) => {
        const id = ++requestId.current;
        setLoading(true);
        setError('');
        try {
            const res = await OmniAPI.getAll(type, {
                ...optionsRef.current.params,
                limit: ITEMS_PER_PAGE + 1,
                offset: (page - 1) * ITEMS_PER_PAGE,
            });
            const rows = Array.isArray(res) ? res : [];
            const pageRows = rows.slice(0, ITEMS_PER_PAGE);
            const shaped = optionsRef.current.transform ? await optionsRef.current.transform(pageRows) : (pageRows as T[]);
            if (id !== requestId.current) return;
            if (shaped.length === 0 && page > 1) {
                fetchPage(page - 1);
                return;
            }
            setData(shaped);
            setHasNext(rows.length > ITEMS_PER_PAGE);
            setCurrentPage(page);
        } catch (err: any) {
            if (id !== requestId.current) return;
            const status = err?.response?.status;
            setError(status === 401 || status === 403
                ? "You don't have access to this list, or your session expired. Try signing in again."
                : 'Could not load this list. Please try again.');
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        if (enabled) fetchPage(1);
    }, [fetchPage, enabled]);

    const refresh = useCallback(() => fetchPage(currentPage), [fetchPage, currentPage]);

    return { data, setData, currentPage, hasNext, loading, error, fetchPage, refresh };
}

function toTitle(snakeStr: string): string {
    return snakeStr
        .replace("_rpi", "_RPI") // Fixed like a true CS major 😎
        .replace("rpi_", "RPI") // Same here 💅💅
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
        .join(' ');
}

interface TableHeadProps<T> {
    heading: string; 
    type?: string;
    updateExisting?: boolean;
    activeItem?: T;
    aemenu?: ReactNode;
}

// calls the api to delete an item from the database. type parameter is the backend type not frontend
export function DeleteItem(type: string, obj: any, onSuccess: () => void) {
    const label = obj.name ?? obj.display_name ?? obj.RCSID ?? 'this item';
    if (!confirm(`Really delete ${label}?`)) return;
    OmniAPI.delete(type, obj.id)
        .then(() => {
            onSuccess();
        }).catch(e => alert("Failed to delete " + type + ": " + e.response?.data?.detail));
}

export function TableHead<T>(props: TableHeadProps<T>) {
    const { heading, type, aemenu } = props;
    return(
        <div className="table-head">
            <h2>{heading}</h2>
            { type == null ? "" : aemenu }
        </div>
    );
}

function Table<T>(props: TableProps<T>) {
    const { columns = [], columnDefs, data, onDelete, onEdit, canEdit, canDelete, loading, error, emptyMessage, compact } = props;
    const hasNextProp = props.hasNext;
    const {
        currentPage: currentPageProp,
        onPageChange,
        resourceType
    } = props;

    const hasDelete = !!(canDelete && onDelete);
    const hasEditOrDelete = !!(canEdit || hasDelete);

    const currentPage = currentPageProp ?? 1;
    const [checkedHasNext, setHasNext] = useState(false);
    const hasNext = hasNextProp ?? checkedHasNext;

    // check for next page by pulling next item 
    const checkHasNext = React.useCallback(() => {
        if (hasNextProp !== undefined) return;
        if (!resourceType) {
            setHasNext(false);
            return;
        }
        const nextOffset = currentPage * ITEMS_PER_PAGE;

        OmniAPI.getAll(resourceType, {limit: 1, offset: nextOffset}).then(res => {
                setHasNext(Array.isArray(res) && res.length > 0);
        }).catch(() => setHasNext(false));
    }, [resourceType, currentPage, hasNextProp]);

    useEffect(() => {
        checkHasNext();
    }, [checkHasNext, data]);

    useEffect(() => {
        if (hasNextProp === undefined && !loading && currentPage > 1 && data.length === 0) {
            onPageChange?.(currentPage - 1);
        }
    }, [data.length, currentPage, loading]);


    const handlePrevious = () => {
        if (currentPage === 1) return;
        onPageChange?.(currentPage - 1);
    };

    const handleNext = () => {
        if (!hasNext) return;
        onPageChange?.(currentPage + 1);
    };

    // arrow keys work like the buttons
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;

            if (e.key === 'ArrowLeft') handlePrevious();
            if (e.key === 'ArrowRight') handleNext();
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [currentPage, hasNext]);

    const defs: ColumnDef<T>[] = columnDefs ?? columns.map((column) => ({
        key: String(column),
        label: toTitle(String(column)),
        render: (row: T) => formatCell(row[column]),
        text: (row: T) => formatCell(row[column]),
    }));

    if (error && data.length === 0) {
        return <p className="table-message table-message--error" role="alert">{error}</p>;
    }
    if (loading && data.length === 0) {
        return <p className="table-message" aria-busy="true">Loading…</p>;
    }
    if (data.length === 0) {
        return <p className="table-message">{emptyMessage ?? 'No items are present.'}</p>;
    } else {
        return (
            <div className={compact ? 'table-container is-compact' : 'table-container'}>
                <table className={[hasEditOrDelete ? 'has-actions' : '', loading ? 'is-loading' : ''].join(' ').trim() || undefined}>
                    <thead>
                        <tr>
                            {defs.map((def) => (
                                <th key={def.key}>{def.label}</th>
                            ))}
                            {hasEditOrDelete && <th id="edit-col"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {defs.map((def) => {
                                    const content = def.render(row);
                                    const title = def.text ? def.text(row) : (typeof content === 'string' ? content : undefined);
                                    return (
                                        <td key={def.key} data-label={def.label}>
                                            <span className="cell-content" title={title}>{content}</span>
                                        </td>
                                    );
                                })}
                                {hasEditOrDelete && (
                                    <td className="icon">
                                        {canEdit && (
                                            <button
                                                type="button"
                                                className="edit"
                                                aria-label="Edit"
                                                onClick={() => onEdit?.(row)}
                                            >
                                                <img src={editIcon} alt="" />
                                            </button>
                                        )}
                                        {hasDelete && (
                                            <button
                                                type="button"
                                                className="trash"
                                                aria-label="Delete"
                                                onClick={() => onDelete(rowIndex, rowIndex)}
                                            >
                                                <img src={deleteIcon} alt="" />
                                            </button>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className='pagination-container'>
                    <div className='pagination'>
                        <button onClick={handlePrevious} disabled={currentPage === 1} aria-label="Previous page">
                            <ArrowLeftIcon />
                        </button>

                        <button className="active" aria-current="page">
                            {currentPage}
                        </button>

                        <button onClick={handleNext} disabled={!hasNext} aria-label="Next page" >
                            <ArrowRightIcon />
                        </button>
                    </div>
                </div>
            </div>
        );
    }
};

export default Table;