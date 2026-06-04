import { useEffect, useRef, useCallback } from "react";
import { storage } from "@wxt-dev/storage";

export function useDraggable(
  panelRef: React.RefObject<HTMLElement | null>,
  storageKey?: string
) {
  const isDragging = useRef(false);
  const startOffset = useRef({ x: 0, y: 0 });

  // Handle position validation and constraint
  const constrainPosition = useCallback((
    left: number,
    top: number,
    panelWidth: number,
    panelHeight: number
  ) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const constrainedLeft = Math.max(0, Math.min(left, viewportWidth - panelWidth));
    const constrainedTop = Math.max(0, Math.min(top, viewportHeight - panelHeight));

    return { left: constrainedLeft, top: constrainedTop };
  }, []);

  // Load initial position from storage
  useEffect(() => {
    if (!storageKey || !panelRef.current) return;

    const loadPosition = async () => {
      try {
        const saved = await storage.getItem<{ top: number; left: number }>(`local:${storageKey}`);
        if (saved && panelRef.current) {
          const rect = panelRef.current.getBoundingClientRect();
          const panelWidth = rect.width || 350;
          const panelHeight = rect.height || 600;

          const { left, top } = constrainPosition(saved.left, saved.top, panelWidth, panelHeight);

          panelRef.current.style.left = `${left}px`;
          panelRef.current.style.top = `${top}px`;
          panelRef.current.style.right = "auto";
          panelRef.current.style.bottom = "auto";
        }
      } catch (err) {
        console.error("Failed to load panel position:", err);
      }
    };

    // Delay slightly to ensure panel has completed its initial layout and sizing
    const timer = setTimeout(loadPosition, 50);
    return () => clearTimeout(timer);
  }, [storageKey, panelRef, constrainPosition]);

  // Keep panel within bounds when window resizes
  useEffect(() => {
    const handleResize = () => {
      if (!panelRef.current || !panelRef.current.style.left) return;
      const rect = panelRef.current.getBoundingClientRect();
      const left = parseFloat(panelRef.current.style.left) || rect.left;
      const top = parseFloat(panelRef.current.style.top) || rect.top;

      const { left: newLeft, top: newTop } = constrainPosition(
        left,
        top,
        rect.width || 350,
        rect.height || 600
      );

      panelRef.current.style.left = `${newLeft}px`;
      panelRef.current.style.top = `${newTop}px`;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [panelRef, constrainPosition]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!panelRef.current) return;
      
      // Drag on left click only
      if (e.button !== 0) return;

      const rect = panelRef.current.getBoundingClientRect();
      
      // Calculate cursor position relative to the top-left of the panel
      startOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      isDragging.current = true;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current || !panelRef.current) return;

        // Prevent default actions like text selection
        moveEvent.preventDefault();

        const left = moveEvent.clientX - startOffset.current.x;
        const top = moveEvent.clientY - startOffset.current.y;

        const { left: newLeft, top: newTop } = constrainPosition(
          left,
          top,
          rect.width || 350,
          rect.height || 600
        );

        panelRef.current.style.left = `${newLeft}px`;
        panelRef.current.style.top = `${newTop}px`;
        panelRef.current.style.right = "auto";
        panelRef.current.style.bottom = "auto";
      };

      const handleMouseUp = async () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);

        // Persist position if storageKey is provided
        if (storageKey && panelRef.current) {
          const currentRect = panelRef.current.getBoundingClientRect();
          try {
            await storage.setItem(`local:${storageKey}`, {
              top: currentRect.top,
              left: currentRect.left,
            });
          } catch (err) {
            console.error("Failed to save panel position:", err);
          }
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelRef, storageKey, constrainPosition]
  );

  return { onMouseDown };
}
