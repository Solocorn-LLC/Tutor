import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FloatingToolMenu } from './floating-tool-menu'

function setup(props = {}) {
  const onToolChange = vi.fn()
  const onColorChange = vi.fn()
  const onLineWidthChange = vi.fn()
  const onClear = vi.fn()
  const onOpenMath = vi.fn()

  const utils = render(
    <FloatingToolMenu
      currentTool="pen"
      currentColor="#000000"
      currentLineWidth={4}
      onToolChange={onToolChange}
      onColorChange={onColorChange}
      onLineWidthChange={onLineWidthChange}
      onClear={onClear}
      onOpenMath={onOpenMath}
      isDrawing={false}
      currentPointerPos={null}
      {...props}
    />
  )

  return {
    ...utils,
    onToolChange,
    onColorChange,
    onLineWidthChange,
    onClear,
    onOpenMath,
  }
}

describe('FloatingToolMenu', () => {
  it('opens the radial menu when the center button is clicked', () => {
    setup()
    const center = screen.getByRole('button', { name: 'Open tool menu' })
    fireEvent.click(center)
    expect(screen.getByRole('button', { name: 'Clear Page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Math' })).toBeInTheDocument()
  })

  it('fires onClear when Clear Page is clicked', () => {
    const { onClear } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open tool menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Page' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('opens the math panel when Math is clicked', () => {
    const { onOpenMath } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open tool menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Math' }))
    expect(onOpenMath).toHaveBeenCalledTimes(1)
  })

  it('switches to eraser with selected width', () => {
    const { onToolChange, onLineWidthChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open tool menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Erase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Large' }))
    expect(onToolChange).toHaveBeenCalledWith('eraser')
    expect(onLineWidthChange).toHaveBeenCalledWith(40)
  })

  it('closes the menu when clicking outside', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Open tool menu' }))
    expect(screen.getByRole('button', { name: 'Clear Page' })).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Clear Page' })).not.toBeInTheDocument()
    })
  })
})
