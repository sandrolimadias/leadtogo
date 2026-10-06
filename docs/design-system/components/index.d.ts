import type * as React from 'react';

export type TagColor = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'indigo' | 'purple' | 'pink';
export type ActivityType = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao' | 'tarefa';
export type ActivityStatus = 'pendente' | 'em_execucao' | 'realizada' | 'cancelada' | 'atrasada';
export type DealStatus = 'ativo' | 'conquistado' | 'perdido' | 'cancelado' | 'suspenso';
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

export interface IconProps { name: string; size?: number; strokeWidth?: number; label?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
  size?: 'sm' | 'md' | 'lg'; icon?: string; iconRight?: string; loading?: boolean; block?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string; label: string; variant?: 'ghost' | 'secondary' | 'primary' | 'fab'; size?: 'sm' | 'md' | 'lg';
}
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export interface SegmentedControlProps { options: { value: string; label: string; icon?: string }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'suffix'> {
  label?: string; hint?: string; error?: string; icon?: string; multiline?: boolean; mono?: boolean; suffix?: React.ReactNode;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; hint?: string; error?: string; placeholder?: string; options: (string | { value: string; label: string })[];
}
export declare function Select(props: SelectProps): React.ReactElement;

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode; description?: string }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode }
export declare function Switch(props: SwitchProps): React.ReactElement;

export interface BadgeProps { tone?: Tone; icon?: string; children?: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;

export interface TagProps { color?: TagColor; dot?: boolean; variant?: 'outline'; onRemove?: () => void; children?: React.ReactNode }
export declare function Tag(props: TagProps): React.ReactElement;

export interface AvatarProps { name: string; src?: string; size?: 'sm' | 'md' | 'lg'; color?: TagColor }
export declare function Avatar(props: AvatarProps): React.ReactElement;

export interface StatTileProps { label: string; value: number | string; currency?: boolean; delta?: string; deltaDirection?: 'up' | 'down'; deltaTone?: 'up' | 'down'; hint?: string; spark?: number[] }
export declare function StatTile(props: StatTileProps): React.ReactElement;

export interface StatusPillProps { status: DealStatus }
export declare function StatusPill(props: StatusPillProps): React.ReactElement;

export interface ActivityIconProps { type: ActivityType; size?: 'sm' | 'md' }
export declare function ActivityIcon(props: ActivityIconProps): React.ReactElement;

export interface PriorityMarksProps { importante?: boolean; urgente?: boolean }
export declare function PriorityMarks(props: PriorityMarksProps): React.ReactElement | null;

export interface TimelineItem { id?: string; type: ActivityType; title: string; status: ActivityStatus; when?: string; contact?: string; owner?: string; importante?: boolean; urgente?: boolean; repeat?: string; note?: string }
export interface ActivityTimelineProps { items: TimelineItem[] }
export declare function ActivityTimeline(props: ActivityTimelineProps): React.ReactElement;

export interface DealCardProps { title: string; company: string; value?: number; mrr?: number; owner?: string; due?: string; dueState?: 'late' | 'today'; next?: { type: ActivityType; label: string } | false; tags?: { label: string; color: TagColor }[]; stale?: string; dragging?: boolean }
export declare function DealCard(props: DealCardProps): React.ReactElement;

export interface TaskCardProps { title: string; type?: ActivityType; company?: string; importante?: boolean; urgente?: boolean; labels?: { label: string; color: TagColor }[]; checklist?: { done: number; total: number }; due?: string; dueState?: 'late' | 'today'; repeat?: string; owner?: string; dragging?: boolean }
export declare function TaskCard(props: TaskCardProps): React.ReactElement;

export interface KanbanColumnProps { title: string; color?: TagColor; count?: number; limit?: number; total?: number; onAdd?: (() => void) | false; addLabel?: string; children?: React.ReactNode }
export declare function KanbanColumn(props: KanbanColumnProps): React.ReactElement;

export interface DataTableColumn<R> { key: string; label: string; align?: 'left' | 'right'; width?: number | string; sorted?: 'asc' | 'desc'; render?: (row: R) => React.ReactNode }
export interface DataTableProps<R = any> { columns: DataTableColumn<R>[]; rows: R[]; selectable?: boolean; defaultSelected?: (string | number)[]; density?: 'compact'; caption?: string }
export declare function DataTable<R = any>(props: DataTableProps<R>): React.ReactElement;

export interface TabsProps { items: { value: string; label: string; icon?: string; count?: number }[]; value?: string; defaultValue?: string; onChange?: (value: string) => void; label?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;

export interface Tenant { name: string; role: string; color?: TagColor }
export interface AppNavProps { productName?: string; tenant?: Tenant; user?: { name: string; role: string }; groups: { label?: string; items: { icon: string; label: string; href?: string; active?: boolean; count?: number }[] }[] }
export declare function AppNav(props: AppNavProps): React.ReactElement;

export interface TenantSwitcherProps { current: Tenant; onClick?: () => void }
export declare function TenantSwitcher(props: TenantSwitcherProps): React.ReactElement;

export type MenuItem = { icon?: string; label: string; shortcut?: string; danger?: boolean; checked?: boolean; onSelect?: () => void } | { separator: true } | { heading: string };
export interface MenuProps { items: MenuItem[]; label?: string }
export declare function Menu(props: MenuProps): React.ReactElement;

export interface TooltipProps { label: string; open?: boolean; children: React.ReactNode }
export declare function Tooltip(props: TooltipProps): React.ReactElement;

export interface AlertProps { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; actions?: React.ReactNode; children?: React.ReactNode }
export declare function Alert(props: AlertProps): React.ReactElement;

export interface ToastProps { tone?: 'success' | 'danger' | 'info' | 'warning'; title: string; description?: string; action?: React.ReactNode; onClose?: () => void }
export declare function Toast(props: ToastProps): React.ReactElement;

export interface EmptyStateProps { icon?: string; title: string; description?: string; actions?: React.ReactNode }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;

export interface SkeletonProps { width?: number | string; height?: number | string; circle?: boolean; lines?: number }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;

export interface DialogProps { title: string; description?: string; footer?: React.ReactNode; open?: boolean; inline?: boolean; onClose?: () => void; children?: React.ReactNode }
export declare function Dialog(props: DialogProps): React.ReactElement | null;

export declare function formatBRL(value: number): string;

declare global {
  interface Window {
    Leadtogo: {
      Icon: typeof Icon; Button: typeof Button; IconButton: typeof IconButton; SegmentedControl: typeof SegmentedControl;
      TextField: typeof TextField; Select: typeof Select; Checkbox: typeof Checkbox; Switch: typeof Switch; Badge: typeof Badge;
      Tag: typeof Tag; Avatar: typeof Avatar; StatTile: typeof StatTile; StatusPill: typeof StatusPill; ActivityIcon: typeof ActivityIcon;
      PriorityMarks: typeof PriorityMarks; ActivityTimeline: typeof ActivityTimeline; DealCard: typeof DealCard; TaskCard: typeof TaskCard;
      KanbanColumn: typeof KanbanColumn; DataTable: typeof DataTable; Tabs: typeof Tabs; AppNav: typeof AppNav; TenantSwitcher: typeof TenantSwitcher;
      Menu: typeof Menu; Tooltip: typeof Tooltip; Alert: typeof Alert; Toast: typeof Toast; EmptyState: typeof EmptyState; Skeleton: typeof Skeleton;
      Dialog: typeof Dialog; formatBRL: typeof formatBRL; iconNames: string[];
    };
  }
}
