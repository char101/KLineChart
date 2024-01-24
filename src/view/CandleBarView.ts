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
import type VisibleData from '../common/VisibleData'
import type BarSpace from '../common/BarSpace'
import { type EventHandler } from '../common/SyntheticEvent'
import { ActionType } from '../common/Action'
import { CandleType, type CandleBarColor, type RectStyle, PolygonType, type LineStyle } from '../common/Styles'

import type ChartStore from '../store/ChartStore'

import { type Axis } from '../component/Axis'
import { type FigureCreate } from '../component/Figure'
import { type LineAttrs } from '../extension/figure/line'
import { type RectAttrs } from '../extension/figure/rect'

import ChildrenView from './ChildrenView'

import { PaneIdConstants } from '../pane/types'
import { isValid } from '../common/utils/typeChecks'

import { fillPathBetween } from '../utils'
import type DrawWidget from '../widget/DrawWidget'
import type DrawPane from '../pane/DrawPane'

export interface CandleBarOptions {
  type: Exclude<CandleType, CandleType.Area>
  styles: CandleBarColor
}

export default class CandleBarView extends ChildrenView {
  constructor (widget: DrawWidget<DrawPane<YAxis>>) {
    super(widget)

    this.registerEvent('mouseClickEvent', (event, other) => {
      const pane = this.getWidget().getPane()
      const chart = pane.getChart()
      if (chart.getChartStore().getOverlayStore().isDrawing()) {
        return
      }

      const timeScaleStore = chart.getChartStore().getTimeScaleStore()
      const yAxis = pane.getAxisComponent()

      const dataIndex = timeScaleStore.coordinateToDataIndex(event.x)
      if (dataIndex !== null) {
        const data = timeScaleStore.getDataByDataIndex(dataIndex)
        if (data) {
          const highY = yAxis.convertToPixel(data.high)
          const lowY = yAxis.convertToPixel(data.low)
          if (event.y > (highY - 20) && event.y < (lowY + 20)) {
            const timestamp = timeScaleStore.dataIndexToTimestamp(dataIndex)
            chart.getChartStore().getActionStore().execute(ActionType.OnCandleBarClick, {timestamp})
          }
        }
      }
      return false
    })
  }

  checkEventOn (event: MouseTouchEvent): boolean {
    return true
  }

  private readonly _boundCandleBarClickEvent = (data: VisibleData) => () => {
    this.getWidget().getPane().getChart().getChartStore().getActionStore().execute(ActionType.OnCandleBarClick, data)
    return false
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const pane = this.getWidget().getPane()
    const isMain = pane.getId() === PaneIdConstants.CANDLE
    const chartStore = pane.getChart().getChartStore()
    const candleBarOptions = this.getCandleBarOptions(chartStore)
    if (candleBarOptions !== null) {
      let ohlcSize = 0
      let halfOhlcSize = 0
      if (candleBarOptions.type === CandleType.Ohlc) {
        const { gapBar } = chartStore.getTimeScaleStore().getBarSpace()
        ohlcSize = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8)
        if (ohlcSize > 2 && ohlcSize % 2 === 1) {
          ohlcSize--
        }
        halfOhlcSize = Math.floor(halfOhlcSize / 2)
      }
      const yAxis = pane.getAxisComponent()
      switch (candleBarOptions.type) {
        case CandleType.CandleSolid:
        case CandleType.PnF:
          return this._drawOhlc(ctx, yAxis, chartStore.getTimeScaleStore().getBarSpace(), candleBarOptions)
        case CandleType.Hlc:
          return this._drawHlc(ctx, yAxis, chartStore.getTimeScaleStore().getBarSpace(), candleBarOptions)
        case CandleType.Hlc2:
          return this._drawHlc2(ctx, yAxis, chartStore.getTimeScaleStore().getBarSpace(), candleBarOptions)
        case CandleType.Line:
          return this._drawLine(ctx, yAxis)
        case CandleType.Line3:
          return this._drawLine3(ctx, yAxis)
        case CandleType.Shade3:
          return this._drawShade3(ctx, yAxis)
      }
      this.eachChildren((data, barSpace) => {
        const { data: kLineData, x } = data
        if (isValid(kLineData)) {
          const { open, high, low, close } = kLineData
          const { type, styles } = candleBarOptions
          const colors: string[] = []
          if (close > open) {
            colors[0] = styles.upColor
            colors[1] = styles.upBorderColor
            colors[2] = styles.upWickColor
          } else if (close < open) {
            colors[0] = styles.downColor
            colors[1] = styles.downBorderColor
            colors[2] = styles.downWickColor
          } else {
            colors[0] = styles.noChangeColor
            colors[1] = styles.noChangeBorderColor
            colors[2] = styles.noChangeWickColor
          }
          const openY = yAxis.convertToPixel(open)
          const closeY = yAxis.convertToPixel(close)
          const priceY = [
            openY, closeY,
            yAxis.convertToPixel(high),
            yAxis.convertToPixel(low)
          ]
          priceY.sort((a, b) => a - b)

          let rects: Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> = []
          switch (type) {
            case CandleType.CandleSolid: {
              rects = this._createSolidBar(x, priceY, barSpace, colors)
              break
            }
            case CandleType.CandleStroke: {
              rects = this._createStrokeBar(x, priceY, barSpace, colors)
              break
            }
            case CandleType.CandleUpStroke: {
              if (close > open) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors)
              }
              break
            }
            case CandleType.CandleDownStroke: {
              if (open > close) {
                rects = this._createStrokeBar(x, priceY, barSpace, colors)
              } else {
                rects = this._createSolidBar(x, priceY, barSpace, colors)
              }
              break
            }
            case CandleType.Ohlc: {
              rects = [
                {
                  name: 'rect',
                  attrs: [
                    {
                      x: x - halfOhlcSize,
                      y: priceY[0],
                      width: ohlcSize,
                      height: priceY[3] - priceY[0]
                    },
                    {
                      x: x - barSpace.halfGapBar,
                      y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
                      width: barSpace.halfGapBar,
                      height: ohlcSize
                    },
                    {
                      x: x + halfOhlcSize,
                      y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
                      width: barSpace.halfGapBar - halfOhlcSize,
                      height: ohlcSize
                    }
                  ],
                  styles: { color: colors[0] }
                }
              ]
              break
            }
          }
          rects.forEach(rect => {
            let handler: EventHandler | undefined
            if (isMain) {
              handler = {
                mouseClickEvent: this._boundCandleBarClickEvent(data)
              }
            }
            this.createFigure(rect, handler)?.draw(ctx)
          })
        }
      })
    }
  }

  protected getCandleBarOptions (chartStore: ChartStore): Nullable<CandleBarOptions> {
    const candleStyles = chartStore.getStyles().candle
    return {
      type: candleStyles.type as Exclude<CandleType, CandleType.Area>,
      styles: candleStyles.bar
    }
  }

  private _createSolidBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[]): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: {
          x,
          y: priceY[0],
          width: 1,
          height: priceY[3] - priceY[0]
        },
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: PolygonType.StrokeFill,
          color: colors[0],
          borderColor: colors[1]
        }
      }
    ]
  }

  private _createStrokeBar (x: number, priceY: number[], barSpace: BarSpace, colors: string[]): Array<FigureCreate<RectAttrs | RectAttrs[], Partial<RectStyle>>> {
    return [
      {
        name: 'rect',
        attrs: [
          {
            x,
            y: priceY[0],
            width: 1,
            height: priceY[1] - priceY[0]
          },
          {
            x,
            y: priceY[2],
            width: 1,
            height: priceY[3] - priceY[2]
          }
        ],
        styles: { color: colors[2] }
      },
      {
        name: 'rect',
        attrs: {
          x: x - barSpace.halfGapBar,
          y: priceY[1],
          width: barSpace.gapBar,
          height: Math.max(1, priceY[2] - priceY[1])
        },
        styles: {
          style: PolygonType.Stroke,
          borderColor: colors[1]
        }
      }
    ]
  }

  private _drawStacked(
    ctx: CanvasRenderingContext2D,
    axis: Axis,
    data: VisibleData,
    barSpace: BarSpace,
    candleBarOptions: CandleBarOptions
  ): void {
    const { styles } = candleBarOptions
    const { data: kLineData, x } = data
    const { high, low, close } = kLineData
    const { halfGapBar, gapBar } = barSpace
    const closeY = axis.convertToPixel(close)
    const lowY = axis.convertToPixel(low)
    const highY = axis.convertToPixel(high)
    const figures: Array<FigureCreate<RectAttrs|LineAttrs, Partial<RectStyle|LineStyle>>> = []
    if (low === high) {
      figures.push({
        name: 'line',
        attrs: {
          coordinates: [
            {x: x - halfGapBar, y: closeY},
            {x: x + halfGapBar, y: closeY}
          ]
        },
        styles: {color: styles.noChangeWickColor}
      })
    } else if (high === close) {
      figures.push({name: 'rect', attrs: {x: x - halfGapBar, y: lowY, width: gapBar, height: highY - lowY}, styles: {color: styles.upColor}})
    } else if (low === close) {
      figures.push({name: 'rect', attrs: {x: x - halfGapBar, y: lowY, width: gapBar, height: highY - lowY}, styles: {color: styles.downColor}})
    } else {
      figures.push({name: 'rect', attrs: {x: x - halfGapBar, y: lowY, width: gapBar, height: closeY - lowY}, styles: {color: styles.upColor}})
      figures.push({name: 'rect', attrs: {x: x - halfGapBar, y: closeY, width: gapBar, height: highY - closeY}, styles: {color: styles.downColor}})
    }
    figures.forEach(fig => {
      this.createFigure(fig)?.draw(ctx);
    });
  }

  private _drawHlc(ctx: CanvasRenderingContext2D, yAxis: Axis, barSpace: BarSpace, candleBarOptions: CandleBarOptions) {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const { halfGapBar, gapBar } = barSpace
    const { styles } = candleBarOptions

    const path = new Path2D();

    for (const item of visibleDataList) {
      const { data, x } = item
      if (!data) continue
      const { high, low, close } = data

      if (high !== low) {
        const highY = yAxis.convertToPixel(high)
        const lowY = yAxis.convertToPixel(low)
        path.moveTo(x, highY)
        path.lineTo(x, lowY)
      }

      const closeY = yAxis.convertToPixel(close)
      path.moveTo(x, closeY)
      path.lineTo(x + halfGapBar, closeY)
    }

    ctx.lineJoin = 'bevel'

    ctx.lineWidth = 2
    ctx.strokeStyle = '#333333'
    ctx.stroke(path)
  }

  private _drawHlc2(ctx: CanvasRenderingContext2D, yAxis: Axis, barSpace: BarSpace, candleBarOptions: CandleBarOptions) {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const { halfGapBar, gapBar } = barSpace
    const { styles } = candleBarOptions

    const upPath = new Path2D()
    const strongUpPath = new Path2D()
    const downPath = new Path2D()
    const strongDownPath = new Path2D()
    const noChangePath = new Path2D()
    const closePath = new Path2D()

    const drawClose = gapBar > 1

    for (const item of visibleDataList) {
      const { data, x } = item
      if (!data) continue
      const { high, low, close } = data

      const d1 = high - close
      const d2 = close - low
      const q = (high - low) / 3
      const s1 = high - q
      const s2 = low + q
      const path = d1 < d2 ? (close >= s1 ? strongUpPath : upPath) : d1 > d2 ? (close <= s2 ? strongDownPath : downPath) : noChangePath

      if (high !== low) {
        const highY = yAxis.convertToPixel(high)
        const lowY = yAxis.convertToPixel(low)
        path.moveTo(x, highY)
        path.lineTo(x, lowY)
      }

      if (drawClose) {
        const closeY = yAxis.convertToPixel(close) + (close == high ? +0.5 : close == low ? -0.5 : 0)
        closePath.moveTo(x, closeY)
        closePath.lineTo(x + halfGapBar, closeY)
      }
    }

    ctx.lineJoin = 'bevel'
    ctx.lineWidth = gapBar > 2 ? Math.round(gapBar * 0.8) : gapBar

    ctx.strokeStyle = styles.upColor.lighten(0.5)
    ctx.stroke(upPath)
    ctx.strokeStyle = styles.upColor.darken(0.5)
    ctx.stroke(strongUpPath)

    ctx.strokeStyle = styles.downColor.lighten(0.5)
    ctx.stroke(downPath)
    ctx.strokeStyle = styles.downColor.darken(0.5)
    ctx.stroke(strongDownPath)

    ctx.strokeStyle = styles.noChangeColor
    ctx.stroke(noChangePath)

    if (drawClose) {
      ctx.lineWidth = 1
      ctx.strokeStyle = '#000000'
      ctx.stroke(closePath)
    }
  }

  private _drawOhlc(ctx: CanvasRenderingContext2D, yAxis: Axis, barSpace: BarSpace, candleBarOptions: CandleBarOptions): void {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const { halfGapBar, gapBar } = barSpace
    const { styles } = candleBarOptions

    const createPaths = () => {
      return {
        upRect: new Path2D(),
        upWickTop: new Path2D(),
        upWickBot: new Path2D(),
        downRect: new Path2D(),
        downWickTop: new Path2D(),
        downWickBot: new Path2D(),
        noChangeRect: new Path2D(),
        noChangeWick: new Path2D(),
      }
    }

    const groups = {
      default: createPaths(),
      green: createPaths(),
      red: createPaths(),
    }

    const minBarHeight = Math.max(Math.floor(gapBar / 5), 2)

    let prevColor = null;
    for (const item of visibleDataList) {
      const { data, x } = item
      if (!data) continue
      const { open, high, low, close, c } = data

      // y direction is reverse to value
      const openY = yAxis.convertToPixel(open)
      const highY = yAxis.convertToPixel(high)
      const lowY = yAxis.convertToPixel(low)
      const closeY = yAxis.convertToPixel(close)

      let g;
      // if (c === 'g') {
      //   g = groups.green
      // } else if (c === 'r' && prevColor === 'g') {
      //   g = groups.red
      // } else {
        g = groups.default
      // }
      prevColor = c

      if (close > open) {
        const barHeight = Math.max(openY - closeY, minBarHeight)
        g.upRect.rect(x - halfGapBar, closeY, gapBar, barHeight)
        if (closeY > highY) {
          g.upWickTop.moveTo(x, highY)
          g.upWickTop.lineTo(x, closeY)
        }
        if (openY < lowY) {
          g.upWickBot.moveTo(x, openY)
          g.upWickBot.lineTo(x, lowY)
        }
      } else if (close < open) {
        const barHeight = Math.max(closeY - openY, minBarHeight)
        g.downRect.rect(x - halfGapBar, openY, gapBar, barHeight)
        if (openY > highY) {
          g.downWickTop.moveTo(x, highY)
          g.downWickTop.lineTo(x, openY)
        }
        if (closeY < lowY) {
          g.downWickBot.moveTo(x, closeY)
          g.downWickBot.lineTo(x, lowY)
        }
      } else {
        g.noChangeRect.rect(x - halfGapBar, closeY, gapBar, minBarHeight)
        if (highY !== lowY) {
          g.noChangeWick.moveTo(x, lowY)
          g.noChangeWick.lineTo(x, highY)
        }
      }
    }

    const paintGroup = (g, upColor, downColor) => {
      ctx.lineWidth = Math.max(Math.floor(gapBar / 5), 1)

      // up body
      ctx.fillStyle = upColor
      ctx.fill(g.upRect)
      // up border
      // ctx.strokeStyle = styles.upBorderClor
      // ctx.stroke(g.upRect)
      // up wick
      ctx.strokeStyle = styles.upBorderColor
      ctx.stroke(g.upWickTop)
      ctx.stroke(g.upWickBot)

      // down body
      ctx.fillStyle = downColor
      ctx.fill(g.downRect)
      // down wick
      ctx.strokeStyle = styles.downWickColor
      ctx.stroke(g.downWickTop)
      ctx.stroke(g.downWickBot)

      // no change body
      ctx.fillStyle = styles.noChangeColor
      ctx.fill(g.noChangeRect)
      // no change wick
      ctx.strokeStyle = styles.noChangeWickColor
      ctx.stroke(g.noChangeWick)
    }

    paintGroup(groups.default, styles.upColor, styles.downColor)
    paintGroup(groups.green, '#00C843', '#F07427')
    paintGroup(groups.red, '#FF9F9F', '#DE1E1E')
  }

  private _drawLine(ctx: CanvasRenderingContext2D, yAxis: Axis): void {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const path = new Path2D()
    for (const item of visibleDataList) {
      if (item.data) {
        path.lineTo(item.x, yAxis.convertToPixel(item.data.close))
      }
    }
    ctx.save()
    // ctx.lineWidth = 2
    ctx.strokeStyle = '#333'
    ctx.stroke(path)
    ctx.restore()
  }

  private _drawLine3(ctx: CanvasRenderingContext2D, yAxis: Axis): void {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const _close = new Path2D()
    const _high = new Path2D()
    const _low = new Path2D()
    for (const item of visibleDataList) {
      const data = item.data
      if (!data) continue
      _close.lineTo(item.x, yAxis.convertToPixel(data.close))
      _high.lineTo(item.x, yAxis.convertToPixel(data.high))
      _low.lineTo(item.x, yAxis.convertToPixel(data.low))
    }
    ctx.save()
    ctx.strokeStyle = '#888888'
    ctx.stroke(_close)
    ctx.strokeStyle = '#50C878'
    ctx.stroke(_high)
    ctx.strokeStyle = '#EB4C42'
    ctx.stroke(_low)
    ctx.restore()
  }

  private _drawShade3(ctx: CanvasRenderingContext2D, yAxis: Axis): void {
    const pane = this.getWidget().getPane()
    const chartStore = pane.getChart().getChartStore()
    const visibleDataList = chartStore.getVisibleDataList()
    const _xs: Array<number> = []
    const _close: Array<number> = []
    const _high: Array<number> = []
    const _low: Array<number> = []
    for (const item of visibleDataList) {
      const data = item.data;
      if (!data) continue;
      _xs.push(item.x)
      _close.push(yAxis.convertToPixel(data.close))
      _high.push(yAxis.convertToPixel(data.high))
      _low.push(yAxis.convertToPixel(data.low))
    }
    fillPathBetween(ctx, _xs, _high, _close, '#EB4C42')
    fillPathBetween(ctx, _xs, _close, _low, '#50C878')
  }
}
