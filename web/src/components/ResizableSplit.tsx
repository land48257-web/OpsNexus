import React, { useState, useRef } from 'react';
import { cn } from '../lib/utils';

interface ResizableSplitProps {
    // Vertical mode props
    top?: React.ReactNode;
    bottom?: React.ReactNode;

    // Horizontal mode props
    left?: React.ReactNode;
    right?: React.ReactNode;

    // Common
    direction?: 'vertical' | 'horizontal';
    initialSize?: number; // Percentage for top/left pane (0-100)
    minFirstPixels?: number;
    minSecondPixels?: number;
    className?: string;

    // Legacy support
    initialTopPercentage?: number;
    minTopPixels?: number;
    minBottomPixels?: number;
    // New prop for collapsible behavior
    collapsed?: boolean;
}

export const ResizableSplit: React.FC<ResizableSplitProps & { usePixels?: boolean }> = ({
    top, bottom, left, right,
    direction = 'vertical',
    initialSize,
    initialTopPercentage = 40,
    minFirstPixels = 100,
    minSecondPixels = 100,
    minTopPixels,
    minBottomPixels,
    className,
    usePixels = false,
    collapsed = false
}) => {
    // Normalize props
    const isVertical = direction === 'vertical';
    const firstPane = isVertical ? top : left;
    const secondPane = isVertical ? bottom : right;
    const startSize = initialSize ?? initialTopPercentage;
    const min1 = minTopPixels ?? minFirstPixels;
    const min2 = minBottomPixels ?? minSecondPixels;

    const [firstSize, setFirstSize] = useState(startSize);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (collapsed) return; // Disable resizing when collapsed
        e.preventDefault();
        isDragging.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();

        let newSize = 0;
        let totalSize = 0;

        if (isVertical) {
            newSize = e.clientY - containerRect.top;
            totalSize = containerRect.height;
        } else {
            newSize = e.clientX - containerRect.left;
            totalSize = containerRect.width;
        }

        if (usePixels) {
            // Pixel mode
            const maxPixels = totalSize - min2;
            newSize = Math.max(min1, Math.min(newSize, maxPixels));
            setFirstSize(newSize);
        } else {
            // Percentage mode
            let newPercent = (newSize / totalSize) * 100;
            const minPercent = (min1 / totalSize) * 100;
            const maxPercent = 100 - ((min2 / totalSize) * 100);
            newPercent = Math.max(minPercent, Math.min(newPercent, maxPercent));
            setFirstSize(newPercent);
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    // Calculate styles based on collapsed state
    const firstPaneStyle = collapsed
        ? { [isVertical ? 'height' : 'width']: '0px', overflow: 'hidden' }
        : { [isVertical ? 'height' : 'width']: usePixels ? `${firstSize}px` : `${firstSize}%` };

    const secondPaneStyle = collapsed
        ? { [isVertical ? 'height' : 'width']: '100%' }
        : { [isVertical ? 'height' : 'width']: usePixels ? undefined : `${100 - (firstSize as number)}%` };

    return (
        <div
            ref={containerRef}
            className={cn(
                "flex h-full w-full overflow-hidden",
                isVertical ? "flex-col" : "flex-row",
                className
            )}
        >
            {/* First Pane */}
            <div
                style={firstPaneStyle}
                className={cn(
                    "flex flex-col min-h-0 min-w-0 relative flex-shrink-0 transition-all duration-300 ease-in-out",
                    collapsed && "opacity-0"
                )}
            >
                {firstPane}
            </div>

            {/* Resizer Handle */}
            <div
                onMouseDown={handleMouseDown}
                className={cn(
                    "bg-muted hover:bg-primary/10 flex-shrink-0 z-10 transition-colors flex items-center justify-center group",
                    isVertical
                        ? "h-1.5 border-y border-border cursor-row-resize w-full"
                        : "w-1.5 border-x border-border cursor-col-resize h-full",
                    collapsed && "hidden" // Hide resizer when collapsed
                )}
            >
                <div className={cn(
                    "bg-muted-foreground/20 rounded-full group-hover:bg-primary/50",
                    isVertical ? "w-8 h-0.5" : "h-8 w-0.5"
                )} />
            </div>

            {/* Second Pane */}
            <div
                style={secondPaneStyle}
                className={cn(
                    "flex flex-col min-h-0 min-w-0 relative transition-all duration-300 ease-in-out",
                    usePixels ? "flex-1" : ""
                )}
            >
                {secondPane}
            </div>
        </div>
    );
};
