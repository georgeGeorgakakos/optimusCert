import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function Row({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="builder-list">
      <div className="q-row" style={{ marginBottom: 8 }}>
        <span className="drag-handle" {...attributes} {...listeners}>⠿</span>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

// items: array of objects with an `id`. renderItem(item, index) => JSX.
export default function SortableList({ items, onReorder, renderItem, idKey = 'id' }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  function onDragEnd(e) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i[idKey] === active.id);
    const newIndex = items.findIndex((i) => i[idKey] === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i[idKey])} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => <Row key={item[idKey]} id={item[idKey]}>{renderItem(item, i)}</Row>)}
      </SortableContext>
    </DndContext>
  );
}
