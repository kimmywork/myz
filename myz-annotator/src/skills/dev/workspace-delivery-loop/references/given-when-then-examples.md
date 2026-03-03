# Given / When / Then Examples

## 空值校验

Given 必填字段为空  
When 点击提交  
Then 显示错误提示并禁止提交

## 无权限访问

Given 用户无权限  
When 访问受限页面  
Then 显示无权限提示且不加载数据

## 成功保存

Given 输入合法且网络正常  
When 点击保存  
Then 显示成功提示且列表出现新记录

## 网络失败

Given 网络不可用  
When 触发保存  
Then 显示失败提示并允许重试

## 超时重试

Given 请求超时  
When 自动重试次数未超限  
Then 再次发起请求并提示重试中
