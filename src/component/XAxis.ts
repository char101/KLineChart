/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Nullable from '../common/Nullable'
import type Bounding from '../common/Bounding'
import { calcTextWidth } from '../common/utils/canvas'
import { isValid } from '../common/utils/typeChecks'

import { type FormatDate, FormatDateType } from '../Options'

import AxisImp, { type AxisTemplate, type Axis, type AxisRange, type AxisTick, type AxisCreateTicksParams } from './Axis'

import type DrawPane from '../pane/DrawPane'

export type XAxis = Axis

export type XAxisConstructor = new (parent: DrawPane<AxisImp>) => XAxisImp

export default abstract class XAxisImp extends AxisImp {
  protected calcRange (): AxisRange {
    const chartStore = this.getParent().getChart().getChartStore()
    const { from, to } = chartStore.getTimeScaleStore().getVisibleRange()
    const af = from
    const at = to - 1
    const range = to - from
    return {
      from: af, to: at, range, realFrom: af, realTo: at, realRange: range
    }
  }

  protected optimalTicks (ticks: AxisTick[]): AxisTick[] {
    return this._optimalTicks(ticks)
    const chart = this.getParent().getChart()
    const chartStore = chart.getChartStore()
    const formatDate = chartStore.getCustomApi().formatDate
    const optimalTicks: AxisTick[] = []
    const tickLength = ticks.length
    const dataList = chartStore.getDataList()
    if (tickLength > 0) {
      const dateTimeFormat = chartStore.getTimeScaleStore().getDateTimeFormat()
      const tickTextStyles = chart.getStyles().xAxis.tickText
      const defaultLabelWidth = calcTextWidth('00-00 00:00', tickTextStyles.size, tickTextStyles.weight, tickTextStyles.family)
      const pos = parseInt(ticks[0].value as string, 10)
      const x = this.convertToPixel(pos)
      let tickCountDif = 1
      if (tickLength > 1) {
        const nextPos = parseInt(ticks[1].value as string, 10)
        const nextX = this.convertToPixel(nextPos)
        const xDif = Math.abs(nextX - x)
        if (xDif < defaultLabelWidth) {
          tickCountDif = Math.ceil(defaultLabelWidth / xDif)
        }
      }
      for (let i = 0; i < tickLength; i += tickCountDif) {
        const pos = parseInt(ticks[i].value as string, 10)
        const kLineData = dataList[pos]
        const timestamp = kLineData.timestamp
        let text = formatDate(dateTimeFormat, timestamp, 'HH:mm', FormatDateType.XAxis)
        if (i !== 0) {
          const prevPos = parseInt(ticks[i - tickCountDif].value as string, 10)
          const prevKLineData = dataList[prevPos]
          const prevTimestamp = prevKLineData.timestamp
          text = this._optimalTickLabel(formatDate, dateTimeFormat, timestamp, prevTimestamp) ?? text
        }
        const x = this.convertToPixel(pos)
        optimalTicks.push({ text, coord: x, value: timestamp })
      }
      const optimalTickLength = optimalTicks.length
      if (optimalTickLength === 1) {
        optimalTicks[0].text = formatDate(dateTimeFormat, optimalTicks[0].value as number, 'YYYY-MM-DD HH:mm', FormatDateType.XAxis)
      } else {
        const firstTimestamp = optimalTicks[0].value as number
        const secondTimestamp = optimalTicks[1].value as number
        if (isValid(optimalTicks[2])) {
          const thirdText = optimalTicks[2].text
          if (/^[0-9]{2}-[0-9]{2}$/.test(thirdText)) {
            optimalTicks[0].text = formatDate(dateTimeFormat, firstTimestamp, 'MM-DD', FormatDateType.XAxis)
          } else if (/^[0-9]{4}-[0-9]{2}$/.test(thirdText)) {
            optimalTicks[0].text = formatDate(dateTimeFormat, firstTimestamp, 'YYYY-MM', FormatDateType.XAxis)
          } else if (/^[0-9]{4}$/.test(thirdText)) {
            optimalTicks[0].text = formatDate(dateTimeFormat, firstTimestamp, 'YYYY', FormatDateType.XAxis)
          }
        } else {
          optimalTicks[0].text = this._optimalTickLabel(formatDate, dateTimeFormat, firstTimestamp, secondTimestamp) ?? optimalTicks[0].text
        }
      }
    }
    return optimalTicks
  }

  private _optimalTicks (ticks: AxisTick[]): AxisTick[] {
    const data = this.getParent().getChart().getDataList()
    const { realFrom, realTo } = this.getRange()
    const optimalTicks: AxisTick[] = []
    const interval = (window as any).api?.interval || '1d'
    const timeScaleStore = this.getParent().getChart().getChartStore().getTimeScaleStore()
    const barSpace = timeScaleStore.getBarSpace()
    const {halfBar} = barSpace;
    switch (interval) {
      case '5m':
      case '10m':
      case '15m':
      case '30m':
      case '1h':
      {
        let prevMonth = null;
        let prevDay = null;
        for (let i = realFrom; i <= realTo; ++i) {
          const row = data[i]
          const dt = new Date(row.timestamp)
          const day = dt.getDate()
          const month = dt.getMonth()
          if (day !== prevDay) {
            optimalTicks.push({
              text: month === prevMonth ? `${day}` : `${dt.toLocaleString('default', {month: 'short'})} ${day}`,
              coord: this.convertToPixel(i) - halfBar, // for intraday grid, draw between the days
              value: i
            })
          }
          prevDay = day
          prevMonth = month
        }
        break
      }
      case '2h':
      case '3h':
      {
        let prevWeek = null
        let prevMonth = null
        for (let i = realFrom; i <= realTo; ++i) {
          const row = data[i]
          const week = row.week
          const dt = new Date(row.timestamp)
          const month = dt.getMonth()
          if (week !== prevWeek) {
            optimalTicks.push({
              text: month === prevMonth ? `${dt.getDate()}` : `${dt.getDate()} ${dt.toLocaleString('default', {month: 'short'})}`,
              coord: this.convertToPixel(i),
              value: i
            })
          }
          prevWeek = week
          prevMonth = month
        }
        break
      }
      case '1d':
        {
        let prevMonth = null;
        let prevYear = null;
        for (let i = realFrom; i <= realTo; ++i) {
          const row = data[i]
          const dt = new Date(row.timestamp)
          const month = dt.getMonth()
          const year = dt.getFullYear()
          const shortMonth = dt.toLocaleString('default', {month: 'short'})
          if (prevMonth !== month) {
            optimalTicks.push({
              text: year === prevYear ? shortMonth : `${dt.getFullYear()}`,
              coord: this.convertToPixel(i), value: i
            })
          }
          prevMonth = month
          prevYear = year
        }
        break
      }
      case '1w':
      case '1mo':
      {
        let prevYear = null;
        for (let i = realFrom; i <= realTo; ++i) {
          const row = data[i]
          const dt = new Date(row.timestamp)
          const year = dt.getFullYear()
          if (year !== prevYear) {
            optimalTicks.push({text: `${year}`, coord: this.convertToPixel(i), value: i})
          }
          prevYear = year
        }
        break
      }
    }
    return optimalTicks
  }

  private _optimalTickLabel (formatDate: FormatDate, dateTimeFormat: Intl.DateTimeFormat, timestamp: number, comparedTimestamp: number): Nullable<string> {
    const year = formatDate(dateTimeFormat, timestamp, 'YYYY', FormatDateType.XAxis)
    const month = formatDate(dateTimeFormat, timestamp, 'YYYY-MM', FormatDateType.XAxis)
    const day = formatDate(dateTimeFormat, timestamp, 'MM-DD', FormatDateType.XAxis)
    if (year !== formatDate(dateTimeFormat, comparedTimestamp, 'YYYY', FormatDateType.XAxis)) {
      return year
    } else if (month !== formatDate(dateTimeFormat, comparedTimestamp, 'YYYY-MM', FormatDateType.XAxis)) {
      return month
    } else if (day !== formatDate(dateTimeFormat, comparedTimestamp, 'MM-DD', FormatDateType.XAxis)) {
      return day
    }
    return null
  }

  override getAutoSize (): number {
    const styles = this.getParent().getChart().getStyles()
    const xAxisStyles = styles.xAxis
    const height = xAxisStyles.size
    if (height !== 'auto') {
      return height
    }
    const crosshairStyles = styles.crosshair
    let xAxisHeight = 0
    if (xAxisStyles.show) {
      if (xAxisStyles.axisLine.show) {
        xAxisHeight += xAxisStyles.axisLine.size
      }
      if (xAxisStyles.tickLine.show) {
        xAxisHeight += xAxisStyles.tickLine.length
      }
      if (xAxisStyles.tickText.show) {
        xAxisHeight += (xAxisStyles.tickText.marginStart + xAxisStyles.tickText.marginEnd + xAxisStyles.tickText.size)
      }
    }
    let crosshairVerticalTextHeight = 0
    if (
      crosshairStyles.show &&
      crosshairStyles.vertical.show &&
      crosshairStyles.vertical.text.show
    ) {
      crosshairVerticalTextHeight += (
        crosshairStyles.vertical.text.paddingTop +
        crosshairStyles.vertical.text.paddingBottom +
        crosshairStyles.vertical.text.borderSize * 2 +
        crosshairStyles.vertical.text.size
      )
    }
    return Math.max(xAxisHeight, crosshairVerticalTextHeight)
  }

  getSelfBounding (): Bounding {
    return this.getParent().getMainWidget().getBounding()
  }

  convertTimestampFromPixel (pixel: number): Nullable<number> {
    const timeScaleStore = this.getParent().getChart().getChartStore().getTimeScaleStore()
    const dataIndex = timeScaleStore.coordinateToDataIndex(pixel)
    return timeScaleStore.dataIndexToTimestamp(dataIndex)
  }

  convertTimestampToPixel (timestamp: number): number {
    const timeScaleStore = this.getParent().getChart().getChartStore().getTimeScaleStore()
    const dataIndex = timeScaleStore.timestampToDataIndex(timestamp)
    return timeScaleStore.dataIndexToCoordinate(dataIndex)
  }

  convertFromPixel (pixel: number): number {
    return this.getParent().getChart().getChartStore().getTimeScaleStore().coordinateToDataIndex(pixel)
  }

  convertToPixel (value: number): number {
    return this.getParent().getChart().getChartStore().getTimeScaleStore().dataIndexToCoordinate(value)
  }

  static extend (template: AxisTemplate): XAxisConstructor {
    class Custom extends XAxisImp {
      createTicks (params: AxisCreateTicksParams): AxisTick[] {
        return template.createTicks(params)
      }
    }
    return Custom
  }
}
