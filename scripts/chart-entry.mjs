import {use} from 'echarts/core';
import {LineChart,BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,AriaComponent,DataZoomComponent,MarkLineComponent,MarkPointComponent} from 'echarts/components';
import {SVGRenderer,CanvasRenderer} from 'echarts/renderers';
use([LineChart,BarChart,GridComponent,TooltipComponent,LegendComponent,AriaComponent,DataZoomComponent,MarkLineComponent,MarkPointComponent,SVGRenderer,CanvasRenderer]);
export {init} from 'echarts/core';
