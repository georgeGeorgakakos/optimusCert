import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';

function Chip({ id, text, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1
  };
  return (
    <div ref={setNodeRef} style={style} className="dnd-chip" {...(disabled ? {} : listeners)} {...attributes}>
      {text}
    </div>
  );
}

function Slot({ id, children, disabled }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return <div ref={setNodeRef} className={'dnd-slot' + (isOver ? ' over' : '')}>{children || <span className="small muted">Drop here</span>}</div>;
}

// value: { [targetId]: itemId }
export default function DragDropQuestion({ data, value = {}, onChange, disabled = false }) {
  const items = data.items || [];
  const targets = data.targets || [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const placed = new Set(Object.values(value));
  const bank = items.filter((it) => !placed.has(it.id));
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));

  function handleDragEnd(e) {
    if (disabled) return;
    const itemId = e.active.id;
    const overId = e.over?.id;
    const next = { ...value };
    // remove item from any current target
    for (const t of Object.keys(next)) if (next[t] === itemId) delete next[t];
    if (overId && overId !== 'bank') {
      // if target already had an item, it returns to the bank automatically (dropped from value)
      next[overId] = itemId;
    }
    onChange(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ marginBottom: 14 }}>
        <div className="small muted" style={{ marginBottom: 6 }}>Items</div>
        <Droppable id="bank">
          <div className="dnd-bank">
            {bank.length === 0 && <span className="small muted">All items placed</span>}
            {bank.map((it) => <Chip key={it.id} id={it.id} text={it.text} disabled={disabled} />)}
          </div>
        </Droppable>
      </div>
      <div>
        {targets.map((t) => (
          <div key={t.id} className="dnd-target">
            <span className="label">{t.label}</span>
            <Slot id={t.id} disabled={disabled}>
              {value[t.id] && <Chip id={value[t.id]} text={itemById[value[t.id]]?.text} disabled={disabled} />}
            </Slot>
          </div>
        ))}
      </div>
    </DndContext>
  );
}

function Droppable({ id, children }) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef}>{children}</div>;
}
