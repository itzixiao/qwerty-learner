import { AmountImageMap } from './AmountQrMap'
import { Amount } from './components/Amount'
import { useEffect, useState } from 'react'

export type AmountType = -1 | 6 | 12 | 36 | 50 | 66
const displayAmount: AmountType[] = [6, 12, 36, 50, 66, -1]

export const DonatingCard = ({ className, onAmountChange }: { className?: string; onAmountChange?: (amount: AmountType) => void }) => {
  const [amount, setAmount] = useState<AmountType | undefined>(undefined)

  const onClickAmount = (amount: AmountType) => {
    setAmount(amount)
  }

  useEffect(() => {
    onAmountChange && amount && onAmountChange(amount as AmountType)
  }, [amount, onAmountChange])

  return null
}
