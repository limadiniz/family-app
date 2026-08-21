/**
 * Camada mínima de componentes ZELII P0 §6.3 — reexporta tudo em um
 * único ponto de entrada (`@/components/ui`) para as páginas existentes
 * adotarem incrementalmente sem precisar apontar para cada arquivo.
 */
export { Button, IconButton } from './button';
export { Input, Textarea, Select } from './input';
export { Card, ActionCard } from './card';
export { StatusBadge } from './status-badge';
export { EmptyState, LoadingState, ErrorState } from './states';
export { PersonAvatar, PersonPicker, type PersonSummary } from './person';
export { PageHeader } from './page-header';
export { SensitiveDataNotice, AccessUntil } from './sensitive-data-notice';
