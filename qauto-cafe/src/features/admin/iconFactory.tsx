export type IconProps = { className?: string }

export function makeIcon(viewBox: string, path: string, fillRule?: 'evenodd') {
  return function NavIcon({ className }: IconProps) {
    return (
      <svg className={className} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d={path} fill="currentColor" fillRule={fillRule} clipRule={fillRule ? 'evenodd' : undefined} />
      </svg>
    )
  }
}
