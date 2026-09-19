/**
 * The single entry point for icons (rule E).
 *
 * Unicode symbols are environment-dependent — glyph shape, stroke weight and baseline don't
 * line up, and they can render as tofu — so they aren't used in the UI.
 * Everything is lucide, with size and stroke weight following the design system's tokens.
 */
export {
  Archive, ArrowDownAZ, ArrowLeft, Bell, Bot, Braces, Brain, ChartNoAxesColumnIncreasing, Check, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleAlert, CircleCheckBig, CircleDot,
  // Status and information
  CirclePause,
  CirclePlay, Clock, Code2, Copy,
  ExternalLink, FileDiff, FilePen,
  FileSearch, FileText, FolderGit2, FolderOpen, FolderTree, Gauge, GitCommitHorizontal, GitPullRequest, GripVertical, Hash,
  // Navigation
  Inbox, Layers, ListChecks, ListFilter, ListTree, Lock,
  LockOpen, Maximize2, MessageSquareText, Minus, MoreHorizontal, Palette, PanelLeftClose,
  PanelLeftOpen, PanelRightClose,
  Paperclip,
  Pin, Play,
  // Actions
  Plus, RefreshCw, RotateCcw, Rows3, ScrollText, Search, Send, Settings,
  Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal,
  Smartphone, Square, SquarePen, Terminal, Timer, Trash2, TriangleAlert, Undo2, User, X, Zap
} from 'lucide-react'

/** The sizes (three steps) and stroke weight are tokens. Borrowed from the design system, never made here. */
export { iconSize as ICON, iconDefaults as iconProps } from '@design-system/react'
