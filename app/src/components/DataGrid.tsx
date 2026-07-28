import { useState, useRef, useEffect, type CSSProperties } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getGroupedRowModel, getExpandedRowModel, getPaginationRowModel, flexRender,
  type ColumnDef, type ColumnOrderState, type GroupingState, type SortingState,
  type ColumnFiltersState, type Header,
} from '@tanstack/react-table';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { InfoTip } from './InfoTip';
import './DataGrid.css';

export type CtxItem = { label: string; href?: string; onClick?: () => void; newTab?: boolean };

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  excelName?: string;
  rowContextMenu?: (row: T) => CtxItem[];
  columnLabels: Record<string, string>; // id → 한글 라벨 (그룹칩·엑셀 헤더용)
  pageSizes?: number[];
};

function DraggableHeader<T>({ header }: { header: Header<T, unknown> }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: header.column.id });
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    width: header.getSize(),
  };
  return (
    <th ref={setNodeRef} style={style} className="dg-th">
      <div className="dg-th-inner">
        <span className="dg-drag" {...attributes} {...listeners} title="드래그: 열 이동 / 그룹 존에 놓으면 그룹핑">⠿</span>
        <button
          type="button"
          className={`dg-th-label${canSort ? ' sortable' : ''}`}
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {sorted === 'asc' && <span className="dg-sort"> ▲</span>}
          {sorted === 'desc' && <span className="dg-sort"> ▼</span>}
        </button>
      </div>
    </th>
  );
}

function GroupZone({ grouping, labels, onRemove }: { grouping: string[]; labels: Record<string, string>; onRemove: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: '__groupzone__' });
  return (
    <div ref={setNodeRef} className={`dg-groupzone${isOver ? ' over' : ''}${grouping.length ? ' active' : ''}`}>
      <span className="dg-gz-label">
        그룹핑
        <InfoTip text="열 머리글의 ⠿ 손잡이를 여기로 끌어다 놓으면 그 열 기준으로 접기/펼치기 트리 그리드가 됩니다. 여러 열을 겹쳐 다단계 그룹도 가능합니다." />
      </span>
      {grouping.length === 0 && <span className="dg-gz-hint">열을 여기로 끌어다 놓아 트리로 묶기</span>}
      {grouping.map((g) => (
        <span key={g} className="dg-chip">
          {labels[g] || g}
          <button type="button" onClick={() => onRemove(g)} aria-label="그룹 해제">×</button>
        </span>
      ))}
    </div>
  );
}

export function DataGrid<T>({ columns, data, excelName = 'export', rowContextMenu, columnLabels, pageSizes = [25, 50, 100] }: Props<T>) {
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => columns.map((c) => (c.id as string)));
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: pageSizes[0] });
  const [ctx, setCtx] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data, columns,
    state: { columnOrder, grouping, sorting, columnFilters, pagination },
    onColumnOrderChange: setColumnOrder,
    onGroupingChange: setGrouping,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    if (over.id === '__groupzone__') {
      const id = active.id as string;
      if (!grouping.includes(id)) setGrouping([...grouping, id]);
      return;
    }
    if (active.id !== over.id) {
      const oldI = columnOrder.indexOf(active.id as string);
      const newI = columnOrder.indexOf(over.id as string);
      if (oldI >= 0 && newI >= 0) setColumnOrder(arrayMove(columnOrder, oldI, newI));
    }
  }

  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default; // 동적 로딩 — 내보낼 때만 번들 로드
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('선석배정');
    const cols = table.getVisibleLeafColumns();
    ws.columns = cols.map((c) => ({ header: columnLabels[c.id] || c.id, key: c.id, width: 16 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6FE0' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    // 현재 필터·정렬이 반영된 leaf(실데이터) 행만
    table.getSortedRowModel().rows.filter((r) => !r.getIsGrouped()).forEach((r) => {
      const rec: Record<string, unknown> = {};
      cols.forEach((c) => { rec[c.id] = r.getValue(c.id); });
      ws.addRow(rec);
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${excelName}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, []);

  const total = table.getFilteredRowModel().rows.length;

  return (
    <div className="dg" ref={wrapRef}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="dg-toolbar">
          <GroupZone grouping={grouping} labels={columnLabels} onRemove={(id) => setGrouping(grouping.filter((g) => g !== id))} />
          <div className="dg-tools">
            <button type="button" className={`dg-btn${showFilters ? ' on' : ''}`} onClick={() => setShowFilters((s) => !s)}>
              열 필터
            </button>
            <button type="button" className="dg-btn" onClick={exportExcel} title="현재 필터·정렬 상태로 내보내기">⭳ Excel</button>
            <InfoTip text="열 머리글을 클릭하면 오름/내림차순 정렬, ⠿ 손잡이로 열 순서를 바꾸거나 그룹 존에 놓아 트리로 묶을 수 있습니다. 행을 우클릭하면 퀵뷰 메뉴가 열립니다." />
            <label className="dg-pagesize">
              페이지당
              <select value={pagination.pageSize} onChange={(e) => setPagination((p) => ({ ...p, pageSize: Number(e.target.value), pageIndex: 0 }))}>
                {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="dg-scroll">
          <table className="dg-table">
            <thead>
              <tr>
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  {table.getHeaderGroups()[0].headers.map((h) => <DraggableHeader key={h.id} header={h} />)}
                </SortableContext>
              </tr>
              {showFilters && (
                <tr className="dg-filter-row">
                  {table.getVisibleLeafColumns().map((c) => (
                    <th key={c.id}>
                      {c.getCanFilter() ? (
                        <input
                          className="dg-filter-in"
                          value={(c.getFilterValue() as string) ?? ''}
                          onChange={(e) => c.setFilterValue(e.target.value)}
                          placeholder="필터"
                          aria-label={`${columnLabels[c.id] || c.id} 필터`}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                if (row.getIsGrouped()) {
                  return (
                    <tr key={row.id} className="dg-group-row" onClick={row.getToggleExpandedHandler()}>
                      <td colSpan={table.getVisibleLeafColumns().length}>
                        <span className="dg-caret">{row.getIsExpanded() ? '▾' : '▸'}</span>
                        <b>{columnLabels[row.groupingColumnId!] || row.groupingColumnId}: </b>
                        {String(row.getGroupingValue(row.groupingColumnId!))}
                        <span className="dg-group-cnt">{row.subRows.length}건</span>
                      </td>
                    </tr>
                  );
                }
                const original = row.original as T;
                return (
                  <tr
                    key={row.id}
                    className="dg-row"
                    style={{ paddingLeft: row.depth * 16 }}
                    onContextMenu={(e) => {
                      if (!rowContextMenu) return;
                      e.preventDefault();
                      setCtx({ x: e.clientX, y: e.clientY, items: rowContextMenu(original) });
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cell.column.id === 'discharge_qty' || cell.column.id === 'load_qty' ? 'num' : ''}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {table.getRowModel().rows.length === 0 && (
                <tr><td colSpan={table.getVisibleLeafColumns().length} className="dg-empty">조건에 맞는 데이터가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>

      <div className="dg-pager">
        <button className="dg-btn" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>‹ 이전</button>
        <span className="dg-pageinfo">
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} 페이지 · 총 {total}건
        </span>
        <button className="dg-btn" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>다음 ›</button>
      </div>

      {ctx && (
        <div className="dg-ctx" style={{ left: Math.min(ctx.x, window.innerWidth - 240), top: Math.min(ctx.y, window.innerHeight - ctx.items.length * 40 - 20) }} onClick={(e) => e.stopPropagation()}>
          {ctx.items.map((it, i) =>
            it.href ? (
              <a key={i} className="dg-ctx-item" href={it.href} target={it.newTab ? '_blank' : undefined} rel="noopener" onClick={() => setCtx(null)}>{it.label}</a>
            ) : (
              <button key={i} className="dg-ctx-item" onClick={() => { it.onClick?.(); setCtx(null); }}>{it.label}</button>
            )
          )}
        </div>
      )}
    </div>
  );
}
