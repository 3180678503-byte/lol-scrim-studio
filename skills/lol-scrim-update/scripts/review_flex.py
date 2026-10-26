"""Transparent role-percentile entertainment awards for tracked allied friends only."""
import argparse,json
from pathlib import Path
from merge import load,save
import roster_policy

def review(p,m):
    gd=p['gd15'];score=p['score'] if p['score'] is not None else -1;kda=f"{p['kills']}/{p['deaths']}/{p['assists']}"
    evidence=f"{kda}，参团 {p['kp']*100:.1f}%" if p['kp'] is not None else f'{kda}，本队零击杀，参团率不可计算'
    evidence+=f"，DPM {p['dpm']:.0f}，视野/分 {p['vspm']:.2f}"
    evidence+=f"，15 分钟对位金币 {gd:+.0f}" if gd is not None else '，缺少可信 15 分钟对位帧'
    if score<0:
        return {'title':'本局暂不计分','roast':'已有数据保留展示，位置、指标或参照补齐后再参加评选。','reason':evidence,'provenance':'位置职责模型v2；缺项不补零'}
    if p['deaths']>=10:
        title='泉水的终身会员'
        lines=['你这不是走位，是给对面送外卖。泉水老板看你这么勤快，已经准备给你排班了。','阵亡提示都快包浆了，对面见你上线，比见兵线还准时。','队友在研究怎么打团，你在研究复活倒计时有没有会员加速。']
    elif gd is not None and gd<-1400:
        title='对线经济刺激计划'
        lines=['15 分钟就把对面扶上小康。队友还在补刀，你已经在做跨队财富转移了。','这条线的经济差不像对线，更像你给对面办了助学贷款，利息还由队友来付。','同样出门一件装备，回来像一个在上班、一个在给老板交学费。']
    elif score>=75:
        title='队伍的承重墙' if p['role']=='UTILITY' else '手动挡代练'
        lines=['队友这把有福了：别人进游戏是匹配，你进游戏像接了救援工单。','建议把这局录像发群里，别光打出成绩，还得防止队友把功劳归给自己。','你这表现值得单开一桌。队友要是还挑刺，建议让他先把结算面板读一遍。']
    elif p['role']=='UTILITY' and p['vspm']>=1.6 and (p['kp'] or 0)>=.6:
        title='峡谷路灯管理局'
        lines=['队友打团靠手，你让队友能看见团。伤害榜没你的座，地图电费账单得写你名字。','视野铺到这份上，队友再迷路就不是眼的问题，是导航没装。','眼位和参团都交了作业，谁还拿伤害喷辅助，建议先卸载结算面板。']
    elif m['selfWin'] and score<40:
        title='顺风车五星乘客'
        lines=['胜利是真的，存在感得另找发票。队友把车开到终点，你负责在后排说这把挺简单。','这把赢得很完整，你的贡献像奶茶里的冰：确实在场，但大家想要的是别的。','建议给队友发个好评，毕竟这趟顺风车连油钱都没收。']
    elif not m['selfWin'] and score>=60:
        title='救护车堵在峡谷'
        lines=['你在抢救比赛，水晶在办出院。努力看得见，胜利这单却显示配送失败。','这局可以申请个人退款：活你干了，分没加，结算像被平台抽了全款。','面板至少能证明你来过，但队伍的胜利按钮好像被人抠走了。']
    elif score<35:
        title='这局先别开麦复盘'
        lines=['嘴先歇会儿，面板替你把证据交齐了。下一局先把手感接上，再把麦克风接上。','操作空间是有的，主要留给了对面。录像建议自己先看，别一上来就找队友开庭。','这把像误点了实习岗位：进场很认真，交付需要队友返工。']
    else:
        title='参与了，但还没封神'
        lines=['这把属于有交作业，没拿满分。别急着争群里的第一把交椅，先把下局的细节补上。','发挥没到封神，也不够封号。数据放桌上了，谁想吹牛先报一下自己的场数。','该干的活干了一部分，剩下的写进下局计划。群里复盘别只靠音量拿评分。']
    return {'title':title,'roast':lines[(m['number']+p['id'])%len(lines)],'reason':evidence,'provenance':'原创规则评语；非论坛引用'}

def main():
    a=argparse.ArgumentParser(description=__doc__);a.add_argument('--site',required=True);args=a.parse_args()
    site=Path(args.site);d=load(site/'data.json');roster_policy.apply(d,roster_policy.load_policy(site));assert d['datasetType'] in ['flex','friends-flex']
    save(site/'data.json',d)
    from scoring_runtime import update_scores
    update_scores(site)
    d=load(site/'data.json')
    for m in d['matches']:
        for p in m['players']:
            p['review']=review(p,dict(m,selfWin=p['win']))
    save(site/'data.json',d)
    print(json.dumps({'games':len(d['matches']),'reviewedPlayerGames':sum(len(m['players']) for m in d['matches'])}))

if __name__=='__main__':main()
