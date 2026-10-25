import { Children, createElement, useLayoutEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { interfaceIconDefinition, indicatorIconDefinition } from '../icons.js';
import { slidePill } from '../motion.js';
import type { Metric } from './types';

// Canonical vector definitions are data. React owns the actual SVG elements;
// no shell, panel, form, event handler or geographic path is parsed here.
const paths = new Map<string, ReactNode>();
function vectorBody(body: string): ReactNode {
  if (paths.has(body)) return paths.get(body);
  const doc = new DOMParser().parseFromString(
    '<svg xmlns="http://www.w3.org/2000/svg">' + body + '</svg>',
    'image/svg+xml',
  );
  const render = (node: Element, index: number): ReactNode =>
    createElement(
      node.localName,
      Object.fromEntries([
        ['key', index],
        ...[...node.attributes].map((a) => [
          a.name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
          a.value,
        ]),
      ]),
      ...[...node.children].map(render),
    );
  const result = [...doc.documentElement.children].map(render);
  paths.set(body, result);
  return result;
}
const aliases: Record<string, string> = {
  bookmark: 'saved',
  home: 'house',
  down: 'chevron-down',
  pin: 'location',
  arrow: 'forward',
  info: 'sources',
  expand: 'fit',
  reset: 'fit',
};
export function Icon({ name, className = 'brand-icon' }: { name: string; className?: string }) {
  const definition = interfaceIconDefinition(aliases[name] || name);
  if (!definition) {
    const directional =
      name === 'left' ? 'M16 8a6 6 0 1 0 0 5M16 3v5h-5' : 'M4 8a6 6 0 1 1 0 5M4 3v5h5';
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d={directional} />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      viewBox={definition.viewBox}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {vectorBody(definition.body)}
    </svg>
  );
}
export function IndicatorIcon({ metric }: { metric: Metric }) {
  const definition = indicatorIconDefinition(metric);
  if (definition)
    return (
      <span className="indicator-icon">
        <svg
          className="thematic-icon"
          viewBox={definition.viewBox}
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {vectorBody(definition.body)}
        </svg>
      </span>
    );
  const employment = metric.catalogId?.startsWith('03.06') || metric.id.startsWith('unemployment'),
    health = metric.shortCategory === 'Health' || metric.id === 'obesity-rate';
  return (
    <span className="indicator-icon">
      {employment ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          <rect width="20" height="14" x="2" y="6" rx="2" />
        </svg>
      ) : health ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
          <path d="M4 12h4l2-4 4 8 2-4h4" />
        </svg>
      ) : (
        <Icon name="indicators" />
      )}
    </span>
  );
}
export const icon = (name: string) => <Icon name={name} />;
export const brandIcon = icon;
export const indicatorIcon = (metric: Metric) => <IndicatorIcon metric={metric} />;
export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'icon' | 'text';
}) {
  return (
    <button
      type="button"
      className={`${variant === 'text' ? 'text-action' : variant + '-button'}${className ? ' ' + className : ''}`}
      {...props}
    />
  );
}
export function Status({
  title,
  children,
  retry,
}: {
  title: string;
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{children}</p>
      {retry && <Button onClick={retry}>Retry data</Button>}
    </div>
  );
}
export function Search({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <Icon name="search" />
      <input
        id={id}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </label>
  );
}
export function PanelHeader({
  title,
  context,
  contextId,
  close,
}: {
  title: string;
  context?: string;
  contextId?: string;
  close?: string;
}) {
  return (
    <div className="drawer-top">
      <div>
        {context && (
          <p id={contextId} className="panel-context">
            {context}
          </p>
        )}
        <h2>{title}</h2>
      </div>
      {close && (
        <Button variant="icon" data-close={close} aria-label={'Close ' + title}>
          ×
        </Button>
      )}
    </div>
  );
}
export function Segmented({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) slidePill(ref.current, ref.current.querySelector('[aria-pressed=true]'));
  });
  return (
    <div ref={ref} className={'segmented ' + className} {...props}>
      <span className="segment-pill" aria-hidden="true" />
      {Children.toArray(children)}
    </div>
  );
}
export function MetricSwitch({ metric }: { metric: Metric }) {
  if (!metric.switchOptions) return null;
  return (
    <div
      className={
        'metric-switch' + (metric.switchGroup === 'race-ethnicity' ? ' metric-switch--race' : '')
      }
      role="group"
      aria-label={metric.switchLabel || 'Measure'}
    >
      {metric.switchOptions.map((option) => (
        <button
          type="button"
          key={option.id}
          data-switch-metric={option.id}
          aria-pressed={option.id === metric.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
